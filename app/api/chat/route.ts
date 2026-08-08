import { chatChain } from "@/lib/chains/chat";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await chatChain.stream({ messages });
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk)); // chunk is already a string now
        }
        controller.close();
      } catch (error) {
        // Without this, an error mid-stream (rate limit, network blip) leaves
        // the client's reader hanging forever instead of rejecting. controller.error()
        // propagates the failure to whoever is reading the response body.
        controller.error(error);
      }
    },
  });

  return new Response(readable);
}
