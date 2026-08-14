import { Client } from "langsmith";
import { RunTree } from "langsmith/run_trees";
import { withRunTree } from "langsmith/traceable";

export const TRACE_ID_HEADER = "x-langsmith-run-id";
export const TRACE_URL_HEADER = "x-langsmith-trace-url";
const TRACE_EXPOSE_HEADERS = `${TRACE_ID_HEADER}, ${TRACE_URL_HEADER}`;

/**
 * Tracing is opt-in: without these env vars the app behaves exactly as before.
 * LANGCHAIN_TRACING_V2 is the older name; LangSmith still honors it.
 */
export function isLangSmithEnabled(): boolean {
  const tracing =
    process.env.LANGSMITH_TRACING === "true" ||
    process.env.LANGCHAIN_TRACING_V2 === "true";
  return tracing && Boolean(process.env.LANGSMITH_API_KEY);
}

let cachedRunUrlBase: string | null = null;
let cachedProjectId: string | null = null;

async function langSmithProject(): Promise<{ id: string; tenantId: string }> {
  const client = new Client();
  const project = await client.readProject({
    projectName: process.env.LANGSMITH_PROJECT || "default",
  });
  cachedProjectId = project.id;
  return { id: project.id, tenantId: project.tenant_id };
}

/** Project UUID — required by createFeedback (LangSmith calls it sessionId). */
export async function langSmithProjectId(): Promise<string> {
  if (cachedProjectId) return cachedProjectId;
  const project = await langSmithProject();
  return project.id;
}

/**
 * LangSmith UI path is /o/{org}/projects/p/{project}/r/{run} — not /runs/{id}.
 * The first call looks up org + project from LANGSMITH_PROJECT; later calls reuse it.
 */
export async function langSmithHeaders(runId?: string): Promise<Record<string, string>> {
  if (!runId) return {};
  const client = new Client();
  if (!cachedRunUrlBase) {
    const project = await langSmithProject();
    cachedRunUrlBase = `${client.getHostUrl()}/o/${project.tenantId}/projects/p/${project.id}/r`;
  }
  return {
    [TRACE_ID_HEADER]: runId,
    [TRACE_URL_HEADER]: `${cachedRunUrlBase}/${runId}?poll=true`,
    "Access-Control-Expose-Headers": TRACE_EXPOSE_HEADERS,
  };
}

/**
 * Opens a parent LangSmith span for one HTTP request.
 *
 * The run id exists as soon as `postRun()` resolves — so it can go in the
 * Response headers *before* a stream starts. Headers cannot be changed after
 * the body begins, which is why we don't wrap the whole handler in `traceable`
 * (that helper would only know the id after the function returned).
 *
 * Call `run(fn)` around LangChain/LangGraph work so child spans nest under
 * this parent. Call `end()` when the work is actually finished — for a
 * stream, that's the last chunk, not when the ReadableStream object is created.
 */
export async function startApiTrace(name: string): Promise<{
  runId?: string;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  end: (error?: unknown) => Promise<void>;
}> {
  if (!isLangSmithEnabled()) {
    return {
      run: (fn) => fn(),
      end: async () => {},
    };
  }

  const tree = new RunTree({
    name,
    run_type: "chain",
    tracingEnabled: true,
  });
  await tree.postRun();

  return {
    runId: tree.id,
    run: (fn) => withRunTree(tree, fn),
    end: async (error) => {
      if (error) {
        await tree.end(
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      } else {
        await tree.end({ ok: true });
      }
      await tree.patchRun();
    },
  };
}
