import { Client } from "langsmith";
import { isLangSmithEnabled, langSmithProjectId } from "@/lib/tracing";

export async function POST(req: Request) {
  if (!isLangSmithEnabled()) {
    return Response.json(
      { error: "LangSmith tracing is off." },
      { status: 400 },
    );
  }

  const { runId, score } = await req.json();
  if (typeof runId !== "string" || (score !== 0 && score !== 1)) {
    return Response.json({ error: "Invalid feedback." }, { status: 400 });
  }

  // sessionId here is the LangSmith *project* UUID, not our agent thread id.
  // The new createFeedback API requires it; omitting it still works today
  // but logs the deprecation warning you saw in the server.
  const client = new Client();
  await client.createFeedback({
    runId,
    sessionId: await langSmithProjectId(),
    key: "user-score",
    score,
  });

  return Response.json({ ok: true });
}
