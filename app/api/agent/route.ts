import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { agentGraph } from "@/lib/graphs/agent";
import {
  getOrCreateSessionId,
  isThreadOwnedByAnyone,
  ownsThread,
  registerThread,
  sessionCookieHeader,
} from "@/lib/sessions";
import { langSmithHeaders, startApiTrace } from "@/lib/tracing";

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

  const config = { configurable: { thread_id: threadId }, streamMode: "updates" as const };
  const trace = await startApiTrace(
    resume !== undefined ? "POST /api/agent (resume)" : "POST /api/agent",
  );

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        await trace.run(async () => {
          // Kept as two separate .stream() calls (not one behind a ternary)
          // because Command vs. plain state are different overloads, and
          // TypeScript can't pick the right one once the value is stored in
          // a variable of the union type.
          const stream =
            resume !== undefined
              ? await agentGraph.stream(new Command({ resume }), config)
              : await agentGraph.stream(
                  { messages: [new HumanMessage(message)] },
                  config,
                );

          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          }
        });
        controller.close();
        await trace.end();
      } catch (error) {
        await trace.end(error);
        controller.error(error);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Set-Cookie": sessionCookieHeader(sessionId),
      "Content-Type": "application/x-ndjson",
      ...(await langSmithHeaders(trace.runId)),
    },
  });
}
