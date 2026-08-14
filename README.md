# langchain-nextjs

A LangChain.js / LangGraph.js learning project built with Next.js and Groq.

## Overview

This project ports LangChain and LangGraph concepts — originally studied in Python (see the sibling project `~/learning/langchain-langgraph`) — into a TypeScript/Next.js app. It grew from a single chat endpoint into a small suite of features that each demonstrate a different piece of the LangChain.js / LangGraph.js API surface: LCEL chains, hybrid RAG over a Nimbus Robotics corpus, a LangGraph agent with parallel tools and human-in-the-loop approval, and optional LangSmith tracing.

## Features

- **Chat** — streaming, multi-turn chat using an LCEL chain (`prompt.pipe(llm).pipe(parser)`).
- **Summarize** — turns the chat conversation into structured JSON (title, key points, action items) via `withStructuredOutput` + Zod.
- **Ask Your Notes** — RAG question-answering over sample documents (`data/*.txt`): hybrid BM25 + MMR retrieval, RRF fusion, LLM re-ranking, then a prompt-injection screen.
- **Agent** — a LangGraph `StateGraph` agent with custom state (`messages`, `sources`, `rejected`), tools that can run in parallel (`search_notes`, `calculator`, `book_room`), a join node, thread-scoped memory, and human-in-the-loop approval before running the calculator or booking a room.
- **LangSmith** — optional tracing. Each tab can open the run in LangSmith and send 👍/👎 feedback (API key stays on the server).

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [LangChain.js](https://js.langchain.com) (`langchain`, `@langchain/core`, `@langchain/groq`, `@langchain/textsplitters`, `@langchain/classic`, `@langchain/community`)
- [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) (`@langchain/langgraph`)
- [LangSmith](https://smith.langchain.com) (`langsmith`) for optional tracing and feedback
- [Groq](https://groq.com) as the LLM provider (`openai/gpt-oss-120b`)
- Local embeddings via `@huggingface/transformers` (no embeddings API key required)
- pnpm as the package manager

## Getting started

**Prerequisites:** Node.js, pnpm.

**Environment variables** — create `.env.local` at the project root:

```bash
GROQ_API_KEY=your_key_here

# Optional — LangSmith observability (the app works without these)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=langchain-nextjs
LANGCHAIN_CALLBACKS_BACKGROUND=false
```

**Install and run:**

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

If `pnpm install` reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds` (some dependencies use native build scripts pnpm blocks by default).

## Project structure

- `app/page.tsx` — the tabbed UI (Chat / Summarize / Ask Your Notes / Agent), including LangSmith trace links.
- `app/api/*/route.ts` — one Route Handler per feature, plus `/api/feedback` for LangSmith scores.
- `lib/llm.ts` — the shared Groq client.
- `lib/tracing.ts` — parent LangSmith span + response headers for each request.
- `lib/chains/*.ts` — LCEL chains for chat and summarization.
- `lib/rag.ts` — the RAG retrieval pipeline, shared by the RAG tab and the agent's notes-search tool.
- `lib/graphs/agent.ts` — the LangGraph agent (custom state, parallel tools, human-in-the-loop, checkpointer).
- `data/*.txt` — sample documents for the RAG feature (HR, products, office, engineering, finance, security).

See [`CLAUDE.md`](./CLAUDE.md) for deeper architectural notes, and [`CONCEPTS.md`](./CONCEPTS.md) for a running log of the LangChain/LangGraph concepts covered along the way.

## Related resources

- Sibling Python project: `~/learning/langchain-langgraph` — the original LangChain/LangGraph study project this one ports concepts from.
