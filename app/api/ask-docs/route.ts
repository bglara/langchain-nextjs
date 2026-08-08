import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { llm, llmFallback } from "@/lib/llm";
import { getRetriever } from "@/lib/rag";

const ragPrompt = ChatPromptTemplate.fromMessages([
  ["system", "Answer the question using ONLY the context below. If the answer isn't in the context, say you don't know.\n\nContext:\n{context}"],
  ["human", "{question}"],
]);

const resilientModel = llm
  .withRetry({ stopAfterAttempt: 3 })
  .withFallbacks([llmFallback.withRetry({ stopAfterAttempt: 2 })]);

const ragChain = ragPrompt.pipe(resilientModel).pipe(new StringOutputParser());

export async function POST(req: Request) {
  const { question } = await req.json();

  const retriever = await getRetriever();
  const relevantDocs = await retriever.invoke(question);
  const context = relevantDocs.map((d) => d.pageContent).join("\n\n");

  const answer = await ragChain.invoke({ context, question });

  return Response.json({
    answer,
    sources: relevantDocs.map((d) => d.metadata.source),
  });
}
