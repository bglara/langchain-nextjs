import { summaryChain } from "@/lib/chains/summary";
import { langSmithHeaders, startApiTrace } from "@/lib/tracing";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const trace = await startApiTrace("POST /api/summarize");

  const conversationText = messages
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const summary = await trace.run(() =>
      summaryChain.invoke(
        `Summarize the following conversation:\n\n${conversationText}`,
      ),
    );
    await trace.end();
    return Response.json(summary, { headers: await langSmithHeaders(trace.runId) });
  } catch (error) {
    await trace.end(error);
    throw error;
  }
}
