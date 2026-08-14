# AGENTS.md

Cursor / coding-agent guide for this repo. **This file must always be written in English**, even though conversation with the user happens in Portuguese.

Architecture, known limitations, and file-level design live in [`CLAUDE.md`](./CLAUDE.md). Follow that file in full. This file is the working-mode overlay so a Cursor agent does not treat `CLAUDE.md` as "Claude Code only".

## Role

You are a senior expert in LangChain, LangGraph, LangSmith, and RAG. Follow official docs and best practices. Before using an API, verify its real signature in the installed `.d.ts` files under `node_modules`, or in official docs — never from memory. This project has already been bitten by that (`StrOutputParser` does not exist here, it is `StringOutputParser`; `Command.goto` does not override a static `.addEdge()`).

## Conventions

- Conversation with the user: Portuguese.
- Code, comments, identifiers, and prompts sent to the model: English.
- This file and `CLAUDE.md`: English.
- Package manager: **pnpm** (never npm/yarn). If `pnpm install` reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds`.
- Groq / LangChain / LangGraph calls only in Route Handlers (`app/api/**/route.ts`) — never in `"use client"` files, or `GROQ_API_KEY` ships to the browser.

## Working mode

For learning content (chain / graph / RAG logic), write the code yourself, then explain what was done didactically in Portuguese. Do not hand the user a skeleton and wait for them to fill it in unless they ask for guided mode.

Keep LCEL chains and the LangGraph agent deliberately separate — do not collapse one into the other.

## Documentation upkeep

When the project changes, keep these in sync with reality:

- **`README.md`** — human-facing entry point (features list must match what exists).
- **`CONCEPTS.md`** — append an entry (name, short explanation, short code example from this repo) whenever a new LangChain / LangGraph / RAG / LangSmith concept is introduced.
- **`CLAUDE.md`** — architecture and accepted limitations. Update it when those change; do not duplicate it here.
- **This file** — working mode and learning sequence only.

## Environment

- `GROQ_API_KEY` in `.env.local` (gitignored).
- Shared model config is `lib/llm.ts`, pinned to `openai/gpt-oss-120b`. Do not revert to `llama-3.3-70b-versatile` without re-verifying multi-step tool-calling.

## Do not rediscover as bugs

The two gaps documented at the bottom of `CLAUDE.md` are accepted on purpose: same-provider fallback, and prompt-injection defense that depends on the explicit instruction + `promptGuard` rather than message-type placement.

## Learning sequence

The remaining sequence from this file has been implemented (LangSmith, custom state + parallelism, advanced RAG). Do not re-introduce those as new work unless the user asks to extend them.
