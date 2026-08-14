import { chatChain } from "@/lib/chains/chat";
import { langSmithHeaders, startApiTrace } from "@/lib/tracing";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const trace = await startApiTrace("POST /api/chat");
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        await trace.run(async () => {
          const stream = await chatChain.stream({ messages });
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
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

  return new Response(readable, { headers: await langSmithHeaders(trace.runId) });
}
