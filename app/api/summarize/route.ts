import { summaryChain } from "@/lib/chains/summary";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const conversationText = messages
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join("\n");

  const summary = await summaryChain.invoke(
    `Summarize the following conversation:\n\n${conversationText}`
  );

  return Response.json(summary);
}
