"use client";
import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col py-8 px-4">
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
      </main>
    </div>
  );
}
