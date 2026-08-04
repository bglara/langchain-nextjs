import { agentGraph } from "@/lib/graphs/agent";

export async function POST(req: Request) {
  const { message, threadId } = await req.json();

  const result = await agentGraph.invoke(
    { messages: [{ role: "user", content: message }] },  // ← ONLY the new message
    { configurable: { thread_id: threadId } }             // ← which conversation
  );

  const last = result.messages[result.messages.length - 1];
  return Response.json({ answer: last.content });
}
