import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { llm } from "@/lib/llm";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful, concise assistant."],
  new MessagesPlaceholder("messages"),
]);

export const chatChain = prompt.pipe(llm).pipe(new StringOutputParser());
