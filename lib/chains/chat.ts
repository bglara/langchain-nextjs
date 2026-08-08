import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { llm, llmFallback } from "@/lib/llm";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful, concise assistant."],
  new MessagesPlaceholder("messages"),
]);

// Retry the primary model up to 3 times; if it still fails when the stream
// is first requested, fall back to the secondary model.
const resilientModel = llm
  .withRetry({ stopAfterAttempt: 3 })
  .withFallbacks([llmFallback.withRetry({ stopAfterAttempt: 2 })]);

export const chatChain = prompt.pipe(resilientModel).pipe(new StringOutputParser());
