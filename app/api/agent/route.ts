import { agentGraph } from "@/lib/graphs/agent";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = await agentGraph.invoke({ messages });
  return Response.json({ messages: result.messages });
}
