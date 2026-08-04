"use client";
import { useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Tab = "chat" | "summarize" | "ask-docs" | "agent";

const TAB_LABELS: Record<Tab, string> = {
  chat: "Chat",
  summarize: "Summarize",
  "ask-docs": "Ask Your Notes",
  agent: "Agent",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  // chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  // summarize state
  const [summary, setSummary] = useState<{
    title: string;
    keyPoints: string[];
    actionItems: string[];
  } | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // ask-docs (RAG) state
  const [question, setQuestion] = useState("");
  const [docsAnswer, setDocsAnswer] = useState<{ answer: string; sources: string[] } | null>(null);
  const [asking, setAsking] = useState(false);

  // agent (LangGraph) state
  const [agentMessages, setAgentMessages] = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentThinking, setAgentThinking] = useState(false);
  const [threadId, setThreadId] = useState("");

  // Generated client-side (not during SSR) to avoid a hydration mismatch.
  useEffect(() => {
    setThreadId(crypto.randomUUID());
  }, []);

  function newThread() {
    setThreadId(crypto.randomUUID());
    setAgentMessages([]);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();

    const nextMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");

    // add an empty assistant message we'll fill in as chunks arrive
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });

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
    setAsking(false);
  }

  async function sendToAgent(e: React.FormEvent) {
    e.preventDefault();

    const userInput = agentInput;
    setAgentInput("");
    setAgentMessages((prev) => [...prev, { role: "user", content: userInput }]);
    setAgentThinking(true);

    // Send ONLY the new message — history lives in the server's checkpointer.
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userInput, threadId }),
    });
    const data = await res.json();

    setAgentMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    setAgentThinking(false);
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
                  className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${
                    m.role === "user"
                      ? "self-end bg-black text-white dark:bg-white dark:text-black"
                      : "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-white"
                  }`}
                >
                  {m.content}
                </div>
              ))}
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

              {agentThinking && (
                <div className="self-start rounded-2xl bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  thinking (may be using tools)...
                </div>
              )}
            </div>

            <form onSubmit={sendToAgent} className="flex gap-2 pt-2">
              <input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="Ask the agent something..."
                className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-4 py-2 text-black dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={agentThinking || !agentInput || !threadId}
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
