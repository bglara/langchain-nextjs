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
