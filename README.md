# langchain-nextjs

A LangChain.js / LangGraph.js learning project built with Next.js and Groq.

## Overview

This project ports LangChain and LangGraph concepts — originally studied in Python (see the sibling project `~/learning/langchain-langgraph`) — into a TypeScript/Next.js app. It grew from a single chat endpoint into a small suite of features that each demonstrate a different piece of the LangChain.js / LangGraph.js API surface, from basic LLM calls all the way to a tool-calling agent with human-in-the-loop approval and persistent memory.

## Features

- **Chat** — streaming, multi-turn chat using an LCEL chain (`prompt.pipe(llm).pipe(parser)`).
- **Summarize** — turns the chat conversation into structured JSON (title, key points, action items) via `withStructuredOutput` + Zod.
- **Ask Your Notes** — RAG question-answering over a small set of sample documents (`data/*.txt`), using local embeddings (no external embeddings API needed).
- **Agent** — a LangGraph `StateGraph` agent with two tools (a hand-rolled calculator and a notes-search tool built on the same RAG retriever), thread-scoped memory via a checkpointer, and human-in-the-loop approval before running the calculator tool.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [LangChain.js](https://js.langchain.com) (`langchain`, `@langchain/core`, `@langchain/groq`, `@langchain/textsplitters`, `@langchain/classic`, `@langchain/community`)
- [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) (`@langchain/langgraph`)
- [Groq](https://groq.com) as the LLM provider (`openai/gpt-oss-120b`)
- Local embeddings via `@huggingface/transformers` (no embeddings API key required)
- pnpm as the package manager

## Getting started

**Prerequisites:** Node.js, pnpm.

**Environment variables** — create `.env.local` at the project root:

```bash
GROQ_API_KEY=your_key_here
```

**Install and run:**

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

If `pnpm install` reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds` (some dependencies use native build scripts pnpm blocks by default).

## Project structure

- `app/page.tsx` — the tabbed UI (Chat / Summarize / Ask Your Notes / Agent).
- `app/api/*/route.ts` — one Route Handler per feature.
- `lib/llm.ts` — the shared Groq client.
- `lib/chains/*.ts` — LCEL chains for chat and summarization.
- `lib/rag.ts` — the RAG retrieval pipeline, shared by the RAG tab and the agent's notes-search tool.
- `lib/graphs/agent.ts` — the LangGraph agent (state, tools, human-in-the-loop, checkpointer).
- `data/*.txt` — sample documents for the RAG feature.

See [`CLAUDE.md`](./CLAUDE.md) for deeper architectural notes, and [`CONCEPTS.md`](./CONCEPTS.md) for a running log of the LangChain/LangGraph concepts covered along the way.

## Related resources

- Sibling Python project: `~/learning/langchain-langgraph` — the original LangChain/LangGraph study project this one ports concepts from.
