import { llm } from "@/lib/llm";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await llm.stream(messages);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(encoder.encode(chunk.content as string));
      }
      controller.close();
    },
  });

  return new Response(readable);
}
