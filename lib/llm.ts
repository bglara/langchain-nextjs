import { ChatGroq } from "@langchain/groq";

export const llm = new ChatGroq({
    model: "openai/gpt-oss-120b",   // was "llama-3.3-70b-versatile"
    temperature: 0,
});

// Fallback model, used via .withFallbacks() by each consumer if the primary
// model is unavailable. Also confirmed (during Phase 3 debugging) to format
// multi-step tool calls correctly, unlike llama-3.3-70b-versatile.
export const llmFallback = new ChatGroq({
    model: "openai/gpt-oss-20b",
    temperature: 0,
});

// A classifier, not a chat model: given a single piece of text, it replies
// with a plain probability string (e.g. "0.999") that the text is a prompt
// injection / jailbreak attempt. Used to screen retrieved RAG content before
// it reaches the main model. Verified empirically (see CLAUDE.md): catches
// blatant attacks (~0.999) with no false positives on real project docs
// (~0.0006), but missed a subtler injection attempt (~0.04) — it's an extra
// layer, not a replacement for the explicit anti-injection prompt instruction.
export const promptGuard = new ChatGroq({
    model: "meta-llama/llama-prompt-guard-2-22m",
});
