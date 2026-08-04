import { llm } from "@/lib/llm";

export async function POST(req: Request) {
  const { message } = await req.json();
  const response = await llm.invoke(message);
  return Response.json({ content: response.content });
}
