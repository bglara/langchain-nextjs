import { agentGraph } from "@/lib/graphs/agent";

export async function POST(req: Request) {
  const { message, threadId } = await req.json();

  const result = await agentGraph.invoke(
    { messages: [{ role: "user", content: message }] },  // ← SÓ a mensagem nova
    { configurable: { thread_id: threadId } }            // ← qual conversa
  );

  const ultima = result.messages[result.messages.length - 1];
  return Response.json({ answer: ultima.content });
}
