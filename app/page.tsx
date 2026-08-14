"use client";
import { useEffect, useState } from "react";

type TraceInfo = { runId: string; url: string; score?: 0 | 1 };
type Message = { role: "user" | "assistant"; content: string; trace?: TraceInfo };
type Tab = "chat" | "summarize" | "ask-docs" | "agent";

const TAB_LABELS: Record<Tab, string> = {
  chat: "Chat",
  summarize: "Summarize",
  "ask-docs": "Ask Your Notes",
  agent: "Agent",
};

function readTraceHeaders(res: Response): TraceInfo | null {
  const runId = res.headers.get("x-langsmith-run-id");
  const url = res.headers.get("x-langsmith-trace-url");
  if (!runId || !url) return null;
  return { runId, url };
}

async function sendFeedback(runId: string, score: 0 | 1) {
  await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId, score }),
  });
}

function TracePanel({
  trace,
  showOffHint,
  onScored,
}: {
  trace: TraceInfo | null;
  showOffHint: boolean;
  onScored: (next: TraceInfo) => void;
}) {
  if (!trace) {
    if (!showOffHint) return null;
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Tracing off — set LANGSMITH_* in .env.local
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <a
        href={trace.url}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Open trace
      </a>
      <button
        type="button"
        disabled={trace.score !== undefined}
        onClick={async () => {
          await sendFeedback(trace.runId, 1);
          onScored({ ...trace, score: 1 });
        }}
        className="disabled:opacity-40"
        aria-label="Thumbs up"
      >
        {trace.score === 1 ? "👍" : "👍"}
      </button>
      <button
        type="button"
        disabled={trace.score !== undefined}
        onClick={async () => {
          await sendFeedback(trace.runId, 0);
          onScored({ ...trace, score: 0 });
        }}
        className="disabled:opacity-40"
        aria-label="Thumbs down"
      >
        👎
      </button>
      {trace.score !== undefined && (
        <span>{trace.score === 1 ? "rated up" : "rated down"}</span>
      )}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatTracingOff, setChatTracingOff] = useState(false);

  const [summary, setSummary] = useState<{
    title: string;
    keyPoints: string[];
    actionItems: string[];
  } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryTrace, setSummaryTrace] = useState<TraceInfo | null>(null);
  const [summaryTracingOff, setSummaryTracingOff] = useState(false);

  const [question, setQuestion] = useState("");
  const [docsAnswer, setDocsAnswer] = useState<{ answer: string; sources: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [docsTrace, setDocsTrace] = useState<TraceInfo | null>(null);
  const [docsTracingOff, setDocsTracingOff] = useState(false);

  const [agentMessages, setAgentMessages] = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentThinking, setAgentThinking] = useState(false);
  const [threadId, setThreadId] = useState("");
  const [pendingApproval, setPendingApproval] = useState<{
    action: string;
    args: unknown;
  } | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentSources, setAgentSources] = useState<string[]>([]);
  const [agentTrace, setAgentTrace] = useState<TraceInfo | null>(null);
  const [agentTracingOff, setAgentTracingOff] = useState(false);

  // Client-only UUID: a useState initializer would differ between SSR and the
  // browser and fail hydration. The set-state-in-effect lint is accepted here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe thread id
    setThreadId(crypto.randomUUID());
  }, []);

  function newThread() {
    setThreadId(crypto.randomUUID());
    setAgentMessages([]);
    setPendingApproval(null);
    setAgentStatus(null);
    setAgentSources([]);
    setAgentTrace(null);
  }

  function noteTrace(res: Response, setOff: (off: boolean) => void): TraceInfo | null {
    const trace = readTraceHeaders(res);
    if (!trace) setOff(true);
    return trace;
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();

    const nextMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });

    const trace = noteTrace(res, setChatTracingOff);
    if (trace) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") updated[updated.length - 1] = { ...last, trace };
        return updated;
      });
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value);

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + chunkText,
        };
        return updated;
      });
    }
  }

  async function summarize() {
    setSummarizing(true);
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    setSummary(data);
    setSummaryTrace(noteTrace(res, setSummaryTracingOff));
    setSummarizing(false);
  }

  async function askDocs(e: React.FormEvent) {
    e.preventDefault();
    setAsking(true);
    setDocsAnswer(null);

    const res = await fetch("/api/ask-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setDocsAnswer(data);
    setDocsTrace(noteTrace(res, setDocsTracingOff));
    setAsking(false);
  }

  // Each NDJSON line from /api/agent is one LangGraph "updates" event.
  // Node names: agent | search_notes | calculator | book_room | join_tools
  // plus { __interrupt__: [...] } when the graph pauses for approval.
  // A rejection never goes back to "agent" — join_tools emits the fixed
  // AIMessage and routes to END — so the UI must read that node too.
  function serializedAssistantText(msg: unknown): string | null {
    const m = msg as {
      kwargs?: { content?: unknown; tool_calls?: unknown[] };
      content?: unknown;
      tool_calls?: unknown[];
    };
    const body = m.kwargs ?? m;
    const toolCalls = body.tool_calls ?? [];
    if (Array.isArray(toolCalls) && toolCalls.length > 0) return null;
    return typeof body.content === "string" && body.content ? body.content : null;
  }

  function handleAgentEvent(event: Record<string, unknown>) {
    if (event.__interrupt__) {
      const interrupts = event.__interrupt__ as { value: { action: string; args: unknown } }[];
      setPendingApproval(interrupts[0].value);
      setAgentStatus(null);
      return;
    }

    if (event.search_notes) {
      const update = event.search_notes as { sources?: string[] };
      if (update.sources?.length) {
        setAgentSources((prev) => [...new Set([...prev, ...update.sources!])]);
      }
      setAgentStatus("searching notes...");
      return;
    }

    if (event.calculator) {
      setAgentStatus("calling calculator...");
      return;
    }

    if (event.book_room) {
      setAgentStatus("booking a room...");
      return;
    }

    if (event.join_tools) {
      const update = event.join_tools as { messages?: unknown[] };
      const text = (update.messages ?? [])
        .map(serializedAssistantText)
        .find((t) => t);
      if (text) {
        setAgentMessages((prev) => [...prev, { role: "assistant", content: text }]);
        setAgentStatus(null);
      } else {
        setAgentStatus("combining tool results...");
      }
      return;
    }

    if (event.agent) {
      const messages = (event.agent as { messages?: unknown[] }).messages ?? [];
      const last = messages[messages.length - 1];
      const text = serializedAssistantText(last);
      if (text) {
        setAgentMessages((prev) => [...prev, { role: "assistant", content: text }]);
        setAgentStatus(null);
      } else {
        const kwargs = (last as { kwargs?: { tool_calls?: { name: string }[] } })?.kwargs;
        const names = (kwargs?.tool_calls ?? []).map((c) => c.name);
        if (names.length > 0) setAgentStatus(`calling ${names.join(", ")}...`);
      }
      return;
    }
  }

  async function consumeAgentStream(res: Response) {
    const trace = noteTrace(res, setAgentTracingOff);
    if (trace) setAgentTrace(trace);

    if (!res.ok) {
      setAgentStatus(null);
      setAgentThinking(false);
      setAgentMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Request failed (${res.status}). Check the server log.` },
      ]);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line.trim()) handleAgentEvent(JSON.parse(line));
        }
      }
    } catch {
      setAgentMessages((prev) => [
        ...prev,
        { role: "assistant", content: "The stream dropped. Check the server log." },
      ]);
    } finally {
      setAgentThinking(false);
      setAgentStatus(null);
    }
  }

  async function sendToAgent(e: React.FormEvent) {
    e.preventDefault();

    const userInput = agentInput;
    setAgentInput("");
    setAgentMessages((prev) => [...prev, { role: "user", content: userInput }]);
    setAgentThinking(true);
    setAgentStatus("thinking...");

    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userInput, threadId }),
    });
    await consumeAgentStream(res);
  }

  async function respondToApproval(approved: boolean) {
    setPendingApproval(null);
    setAgentThinking(true);
    setAgentStatus("thinking...");

    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, resume: { approved } }),
    });
    await consumeAgentStream(res);
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col py-8 px-4">
        <div className="flex gap-2 border-b border-zinc-300 dark:border-zinc-700 pb-3 mb-4">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                activeTab === tab
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-black dark:text-white"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === "chat" && (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex max-w-[80%] flex-col gap-1 ${
                    m.role === "user" ? "self-end items-end" : "self-start items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2 whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "bg-zinc-200 text-black dark:bg-zinc-800 dark:text-white"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.trace && (
                    <TracePanel
                      trace={m.trace}
                      showOffHint={false}
                      onScored={(next) =>
                        setMessages((prev) =>
                          prev.map((msg, idx) => (idx === i ? { ...msg, trace: next } : msg)),
                        )
                      }
                    />
                  )}
                </div>
              ))}
              {chatTracingOff && messages.length > 0 && (
                <TracePanel trace={null} showOffHint onScored={() => {}} />
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 pt-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say something..."
                className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-4 py-2 text-black dark:text-white outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-black dark:bg-white text-white dark:text-black px-5 py-2 font-medium"
              >
                Send
              </button>
            </form>
          </div>
        )}

        {activeTab === "summarize" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={summarize}
              disabled={messages.length === 0 || summarizing}
              className="self-start rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium text-black dark:text-white disabled:opacity-40"
            >
              {summarizing ? "Summarizing..." : "Summarize conversation"}
            </button>

            {messages.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Chat a bit in the Chat tab first, then come back here to summarize it.
              </p>
            )}

            {summary && (
              <div className="rounded-2xl border border-zinc-300 dark:border-zinc-700 p-4 text-sm text-black dark:text-white">
                <h3 className="font-semibold mb-2">{summary.title}</h3>

                <p className="font-medium mt-2">Key points</p>
                <ul className="list-disc list-inside">
                  {summary.keyPoints.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>

                {summary.actionItems.length > 0 && (
                  <>
                    <p className="font-medium mt-2">Action items</p>
                    <ul className="list-disc list-inside">
                      {summary.actionItems.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-3">
                  <TracePanel
                    trace={summaryTrace}
                    showOffHint={summaryTracingOff}
                    onScored={setSummaryTrace}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "ask-docs" && (
          <div className="flex flex-col gap-3">
            <form onSubmit={askDocs} className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask something about the sample docs..."
                className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-4 py-2 text-black dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={asking || !question}
                className="rounded-full bg-black dark:bg-white text-white dark:text-black px-5 py-2 font-medium disabled:opacity-40"
              >
                {asking ? "Asking..." : "Ask"}
              </button>
            </form>

            {docsAnswer && (
              <div className="rounded-2xl border border-zinc-300 dark:border-zinc-700 p-4 text-sm text-black dark:text-white">
                <p className="whitespace-pre-wrap">{docsAnswer.answer}</p>
                {docsAnswer.sources.length > 0 && (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Sources: {docsAnswer.sources.join(", ")}
                  </p>
                )}
                <div className="mt-3">
                  <TracePanel
                    trace={docsTrace}
                    showOffHint={docsTracingOff}
                    onScored={setDocsTrace}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "agent" && (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 pb-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Thread: <span className="font-mono">{threadId.slice(0, 8) || "..."}</span>
                {" — memory lives on the server, the client only sends the new message."}
              </p>
              <button
                onClick={newThread}
                className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs font-medium text-black dark:text-white"
              >
                New thread
              </button>
            </div>

            {agentSources.length > 0 && (
              <p className="pb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Sources:{" "}
                {agentSources.map((s) => (
                  <span
                    key={s}
                    className="mr-1 inline-block rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5"
                  >
                    {s}
                  </span>
                ))}
              </p>
            )}

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
              {agentMessages.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Try: &quot;My name is Bruno and I have 23 drones.&quot; and then
                  &quot;How much would I pay for Nimbus Cloud Sync per year?&quot;
                </p>
              )}

              {agentMessages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${
                    m.role === "user"
                      ? "self-end bg-black text-white dark:bg-white dark:text-black"
                      : "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-white"
                  }`}
                >
                  {m.content}
                </div>
              ))}

              {agentThinking && !pendingApproval && agentStatus && (
                <div className="self-start rounded-2xl bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {agentStatus}
                </div>
              )}

              {pendingApproval && (
                <div className="self-start max-w-[90%] rounded-2xl border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-black dark:text-white">
                  <p className="font-medium mb-1">Approval needed</p>
                  <p className="mb-2">
                    The agent wants to call{" "}
                    <span className="font-mono">{pendingApproval.action}</span> with:
                  </p>
                  <pre className="mb-3 overflow-x-auto rounded-lg bg-black/5 dark:bg-white/10 px-2 py-1 text-xs">
                    {JSON.stringify(pendingApproval.args, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToApproval(true)}
                      disabled={agentThinking}
                      className="rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => respondToApproval(false)}
                      disabled={agentThinking}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {(agentTrace || agentTracingOff) && (
                <TracePanel
                  trace={agentTrace}
                  showOffHint={agentTracingOff}
                  onScored={setAgentTrace}
                />
              )}
            </div>

            <form onSubmit={sendToAgent} className="flex gap-2 pt-2">
              <input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="Ask the agent something..."
                disabled={!!pendingApproval}
                className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-4 py-2 text-black dark:text-white outline-none disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={agentThinking || !agentInput || !threadId || !!pendingApproval}
                className="rounded-full bg-black dark:bg-white text-white dark:text-black px-5 py-2 font-medium disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
