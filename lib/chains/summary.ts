import { z } from "zod";
import { llm, llmFallback } from "@/lib/llm";

const summarySchema = z.object({
  title: z.string().describe("A short title for this conversation"),
  keyPoints: z.array(z.string()).describe("Main points discussed"),
  actionItems: z.array(z.string()).describe("Any follow-up actions mentioned, if any"),
});

// withStructuredOutput() must be applied to each model BEFORE composing
// retry/fallback — it changes the model into a structured-output Runnable,
// and the fallback needs that same shape too, not the bare chat model.
export const summaryChain = llm
  .withStructuredOutput(summarySchema)
  .withRetry({ stopAfterAttempt: 3 })
  .withFallbacks([
    llmFallback.withStructuredOutput(summarySchema).withRetry({ stopAfterAttempt: 2 }),
  ]);
