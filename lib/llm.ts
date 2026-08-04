import { ChatGroq } from "@langchain/groq";

export const llm = new ChatGroq({
    model: "openai/gpt-oss-120b",   // era "llama-3.3-70b-versatile"
    temperature: 0,
});
