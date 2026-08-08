import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { agentGraph } from "@/lib/graphs/agent";
import {
  getOrCreateSessionId,
  isThreadOwnedByAnyone,
  ownsThread,
  registerThread,
  sessionCookieHeader,
} from "@/lib/sessions";

export async function POST(req: Request) {
  const { message, threadId, resume } = await req.json();
  const { sessionId } = getOrCreateSessionId(req);

  // Ownership check. A bare threadId in the request body proves nothing on
  // its own — anyone could send any UUID and read/resume someone else's
  // paused conversation (including a pending approval). Resuming requires
  // owning the thread; a new message registers it to this session (or is
  // rejected if it already belongs to a different one).
  if (resume !== undefined) {
    if (!ownsThread(sessionId, threadId)) {
      return Response.json({ error: "Not authorized for this thread." }, { status: 403 });
    }
  } else {
    if (isThreadOwnedByAnyone(threadId) && !ownsThread(sessionId, threadId)) {
      return Response.json({ error: "Not authorized for this thread." }, { status: 403 });
    }
    registerThread(sessionId, threadId);
  }

  const config = { configurable: { thread_id: threadId } };

  // A resume request carries a decision instead of a new user message.
  const result =
    resume !== undefined
      ? await agentGraph.invoke(new Command({ resume }), config)
      : await agentGraph.invoke({ messages: [{ role: "user", content: message }] }, config);

  const body = isInterrupted<{ action: string; args: unknown }>(result)
    ? { interrupted: true, pending: result[INTERRUPT][0].value }
    : { interrupted: false, answer: result.messages[result.messages.length - 1].content };

  return Response.json(body, {
    headers: { "Set-Cookie": sessionCookieHeader(sessionId) },
  });
}
