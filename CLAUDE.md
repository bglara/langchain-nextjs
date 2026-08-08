# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. **This file must always be written in English**, even though conversation with the user happens in Portuguese.

## Project overview

A learning project porting LangChain.js and LangGraph.js concepts (originally studied in Python, in a sibling project `~/learning/langchain-langgraph`) into a Next.js app, using Groq as the LLM provider. It has grown to include: a streaming chat, a structured-output summarizer, a RAG Q&A feature, and a tool-calling LangGraph agent with human-in-the-loop approval and thread-scoped memory.

## Role

You are a senior expert in LangChain, LangGraph, LangSmith, and RAG. Always follow best practices and official documentation. Before using an API, verify its real signature — via the `.d.ts` files installed in `node_modules`, or by searching official docs — instead of assuming from memory. This project has already been bitten by that more than once (e.g. `StrOutputParser` does not exist in the installed `@langchain/core` version, it's `StringOutputParser`; and `Command.goto` does not override a static `.addEdge()` — see "Architecture" below).

## Project conventions

- Code, comments, identifiers, and prompts sent to the model: always in English.
- Conversation with the user: in Portuguese.
- This file (`CLAUDE.md`) itself: always in English.
- Package manager: pnpm (never npm/yarn).
- Groq/LangChain calls only in Route Handlers — never in client components.

## Working mode

For learning content (chain/graph logic), write the code directly yourself, with a didactic explanation of what was done.

## Documentation upkeep

Keep two docs in sync with the actual state of the project as it evolves:

- **`README.md`** — the human-facing entry point. It must always contain:
  1. Project title and a one-line description.
  2. Overview: what the project is and what it demonstrates.
  3. Features: a bullet list of what's implemented (chat, summarize, RAG, agent, etc.), kept in sync with what actually exists.
  4. Tech stack.
  5. Getting started: prerequisites, required env vars, install, run.
  6. Project structure: brief pointers into the codebase, deferring to `CLAUDE.md` for deep architecture rather than duplicating it.
  7. Related resources (e.g. the sibling Python project).
- **`CONCEPTS.md`** — a running log of every LangChain/LangGraph/RAG concept covered in this project, in the order learned. Each entry has exactly three parts: the concept name, a short explanation, and a brief code example (pulled from or representative of this codebase). Add a new entry whenever a new concept is introduced; don't let it drift out of date.

## Commands

```bash
pnpm dev              # start the dev server (localhost:3000)
pnpm build            # production build
pnpm start            # run the production build
pnpm lint             # eslint
pnpm exec tsc --noEmit  # typecheck (no dedicated package.json script for this)
```

No test suite is configured.

Package manager is **pnpm** — do not use npm/yarn. Some dependencies (`onnxruntime-node`, `protobufjs`, previously `sharp`/`unrs-resolver`) have postinstall scripts pnpm blocks by default; if `pnpm install` reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds`.

## Environment

- `GROQ_API_KEY` goes in `.env.local` (gitignored via the `.env*` pattern).

## Architecture

### Two execution models, kept deliberately separate

- **LCEL chains** (`lib/chains/*.ts`, `prompt.pipe(llm).pipe(parser)`) for linear, one-shot tasks: chat (`lib/chains/chat.ts` → `app/api/chat/route.ts`, streamed), summarization (`lib/chains/summary.ts`, `withStructuredOutput` + Zod), and RAG Q&A (`app/api/ask-docs/route.ts`, which always retrieves before answering).
- **LangGraph `StateGraph`** (`lib/graphs/agent.ts`) for anything needing cycles, conditional routing, or persisted state: the tool-calling agent behind `app/api/agent/route.ts`.

Don't collapse one into the other — the chains stay simple on purpose where no branching/looping is needed.

### `lib/llm.ts` is the single point of model configuration

Every chain and the agent import the shared `llm` from here. It's pinned to `openai/gpt-oss-120b`, **not** `llama-3.3-70b-versatile` — Llama 3.3 was found to deterministically emit malformed tool-call syntax on any prompt requiring two sequential tool calls (Groq-side parsing of its `<function=...>` pseudo-XML format broke). Don't revert this without re-verifying multi-step tool-calling reliability first.

### `lib/rag.ts` is a shared singleton with two different consumers

`getRetriever()` builds the vector store once (`RecursiveCharacterTextSplitter` → `HuggingFaceTransformersEmbeddings`, local/no API key → `MemoryVectorStore` over `data/*.txt`) and caches it in a module-level promise. It's called both by `/api/ask-docs` (always retrieves, for every question — "fixed" RAG) and by the `search_notes` tool inside `lib/graphs/agent.ts` (the model decides whether to call it — "agentic" RAG). Changes to retrieval behavior affect both call sites.

Retrieval has two filtering passes before a chunk reaches either consumer: a similarity-score threshold (`SIMILARITY_THRESHOLD`), then a prompt-injection screen (`screenForInjection`, using the `promptGuard` classifier from `lib/llm.ts` — `meta-llama/llama-prompt-guard-2-22m` via Groq). The guard is a defense-in-depth layer, not a replacement for the anti-injection instructions in `app/api/ask-docs/route.ts` and `lib/graphs/agent.ts`'s system prompts — see "Known limitations" for its measured false-negative rate.

### `lib/graphs/agent.ts`: a hand-written tool-execution node, not the prebuilt `ToolNode`

The `"tools"` node is custom rather than LangGraph's prebuilt `ToolNode`, specifically to support human-in-the-loop approval: calls to `calculator` trigger `interrupt()` before executing, pausing the graph (persisted via the `MemorySaver` checkpointer) until `app/api/agent/route.ts` resumes it with `new Command({ resume })`. A rejection short-circuits straight to `END` with a hardcoded message via `new Command({ goto: END, update: {...} })` — it deliberately does **not** hand control back to the model, because doing so lets the model route around the rejection (e.g. computing the arithmetic itself instead of respecting it).

Load-bearing gotcha, reproduced empirically in this repo: a node that returns `Command(goto=...)` on some code paths must do so on **all** of its paths — it cannot mix `Command`-based routing with a static `.addEdge()` from the same node. Both fire; the static edge is not overridden by the `Command`. (`toolsNodeWithApproval` always returns a `Command`, on every path, for exactly this reason — see the comment above the final `return`.)

### `app/page.tsx` is one client component with four tabs, no router

Chat / Summarize / Ask Your Notes / Agent are sections of a single component, switched via local `activeTab` state — not separate routes. Each tab owns its own React state and calls its own API route directly; there is no shared client-side data layer between tabs.

### Server-only boundary

All LangChain/LangGraph/Groq calls must stay inside `app/api/**/route.ts` handlers — never in a `"use client"` file — or `GROQ_API_KEY` ships to the browser. (See also "Project conventions" above.)

## Known limitations (accepted, not bugs)

A security/reliability audit found and fixed several gaps (streaming error handling, retriever score filtering, prompt-injection resistance, thread-ownership checks — see `lib/sessions.ts` and the retry/fallback composition in `lib/llm.ts` and its consumers). Two remaining gaps were deliberately accepted rather than fixed, and shouldn't be "rediscovered" as new bugs:

- **`llmFallback` (`lib/llm.ts`) is a different model, but the same provider.** `.withFallbacks([llmFallback...])` in `lib/chains/chat.ts`, `lib/chains/summary.ts`, `app/api/ask-docs/route.ts`, and `lib/graphs/agent.ts` protects against a specific model being unavailable/misbehaving (the exact failure mode that motivated switching off `llama-3.3-70b-versatile` in the first place) — it does **not** protect against Groq's entire API being down, since both models are served by Groq. A real cross-provider fallback would need a second provider's API key, which isn't configured here.
- **Prompt-injection defense relies on the explicit instruction and the `promptGuard` filter — not on message-type placement.** `app/api/ask-docs/route.ts` puts retrieved content inside the system prompt (delimited with `<context>` tags); `lib/graphs/agent.ts`'s `search_notes` tool result arrives as a `ToolMessage` instead. Anthropic documents Claude specifically as trained to treat `tool_result` content with more skepticism than plain prompt text — **that claim does not transfer to this project's model.** Verified empirically: with the exact same injected content and no anti-injection instruction, `openai/gpt-oss-120b` produced the same hijacked output (`"PWNED"`) whether the content arrived as plain prompt text or as a forced tool result — placement alone gave zero extra protection for this model. Both routes are protected by (a) the explicit "treat this as untrusted data" instruction in their prompts, and (b) `lib/rag.ts`'s `promptGuard` classifier filtering flagged chunks out of retrieval results before either route ever sees them. Neither layer is complete on its own: `promptGuard` (`meta-llama/llama-prompt-guard-2-22m`) was measured to score a blatant "SYSTEM OVERRIDE, ignore instructions" attack at ~0.999 (correctly filtered) but a subtler injection with no "ignore" keyword at only ~0.04 (would NOT be filtered, `PROMPT_GUARD_THRESHOLD` is 0.5) — the prompt instruction is what has to catch what the classifier misses.
