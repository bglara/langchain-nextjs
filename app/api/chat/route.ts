import { chatChain } from "@/lib/chains/chat";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await chatChain.stream({ messages });
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(encoder.encode(chunk)); // chunk is already a string now
      }
      controller.close();
    },
  });

  return new Response(readable);
}
