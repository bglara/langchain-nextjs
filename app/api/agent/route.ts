import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { agentGraph } from "@/lib/graphs/agent";

export async function POST(req: Request) {
  const { message, threadId, resume } = await req.json();
  const config = { configurable: { thread_id: threadId } };

  // A resume request carries a decision instead of a new user message.
  const result =
    resume !== undefined
      ? await agentGraph.invoke(new Command({ resume }), config)
      : await agentGraph.invoke({ messages: [{ role: "user", content: message }] }, config);

  if (isInterrupted<{ action: string; args: unknown }>(result)) {
    const pending = result[INTERRUPT][0].value;
    return Response.json({ interrupted: true, pending });
  }

  const last = result.messages[result.messages.length - 1];
  return Response.json({ interrupted: false, answer: last.content });
}
