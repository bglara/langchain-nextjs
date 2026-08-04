import { z } from "zod";
import { llm } from "@/lib/llm";

const summarySchema = z.object({
  title: z.string().describe("A short title for this conversation"),
  keyPoints: z.array(z.string()).describe("Main points discussed"),
  actionItems: z.array(z.string()).describe("Any follow-up actions mentioned, if any"),
});

export const summaryChain = llm.withStructuredOutput(summarySchema);
