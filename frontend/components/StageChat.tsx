"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Send, Trash2, Bot, User, Loader2, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { streamChat, ChatMessage } from "@/lib/api";

const STAGE_SUGGESTIONS: Record<number, string[]> = {
  1: [
    "What are the client's key requirements?",
    "Are there any gaps in the questionnaire?",
    "What risks have been identified?",
    "What is the client's main priority?",
  ],
  2: [
    "Summarise the scope of work",
    "What is explicitly excluded from scope?",
    "Where could scope creep occur?",
    "Review the delivery milestones",
  ],
  3: [
    "Explain the cost breakdown",
    "What is the development timeline?",
    "Which phase carries the highest risk?",
    "How does this compare to similar projects?",
  ],
};

const STAGE_NAMES: Record<number, string> = {
  1: "Questionnaire",
  2: "Scope of Work",
  3: "Development Plan",
};

interface Props {
  projectId: string;
  stageNumber: number;
}

export default function StageChat({ projectId, stageNumber }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<boolean>(false);

  const suggestions = STAGE_SUGGESTIONS[stageNumber] ?? [];

  // Auto-scroll to bottom when messages change or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError("");
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);
    abortRef.current = false;

    try {
      const gen = streamChat(projectId, trimmed, stageNumber, history);
      for await (const chunk of gen) {
        if (abortRef.current) break;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1)); // remove empty assistant bubble
    } finally {
      setStreaming(false);
    }
  }, [messages, projectId, stageNumber, streaming]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function clearChat() {
    abortRef.current = true;
    setMessages([]);
    setError("");
    setStreaming(false);
  }

  const isEmpty = messages.length === 0;
  const lastIsStreaming = streaming && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" style={{ height: "580px" }}>
      {/* Header */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-3.5 flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-white/10">
          <Sparkles className="w-4 h-4 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-none">AI Assistant</p>
          <p className="text-xs text-indigo-300 mt-0.5 truncate">Stage {stageNumber} — {STAGE_NAMES[stageNumber]}</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Clear conversation"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {streaming && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-300">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {isEmpty ? (
          <EmptyState suggestions={suggestions} onSelect={(s) => send(s)} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isStreaming={lastIsStreaming && i === messages.length - 1}
              />
            ))}
          </>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            rows={1}
            placeholder="Ask anything about this stage…"
            className="flex-1 resize-none text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder:text-slate-300 disabled:opacity-60 leading-relaxed"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function EmptyState({ suggestions, onSelect }: { suggestions: string[]; onSelect: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-4">
        <Bot className="w-6 h-6 text-indigo-500" />
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-1">AI Stage Assistant</p>
      <p className="text-xs text-slate-400 mb-5 max-w-[200px]">
        Ask me anything about this stage, the documents, or the client engagement.
      </p>
      <div className="w-full space-y-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-left transition group"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition shrink-0" />
            <span className="text-xs text-slate-600 group-hover:text-indigo-700 transition leading-snug">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-end gap-2 max-w-[85%]">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-md shadow-sm">
            <p className="leading-relaxed">{message.content}</p>
          </div>
          <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center mb-0.5">
            <User className="w-3.5 h-3.5 text-indigo-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex items-end gap-2 max-w-[90%]">
        <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mb-0.5">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="bg-white border border-slate-200/80 text-slate-800 text-sm px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
          {message.content ? (
            <div className="markdown-body text-sm text-slate-700 leading-relaxed">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 mt-3 mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold text-slate-900 mt-3 mb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-800 mt-2 mb-0.5">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                  em: ({ children }) => <em className="italic text-slate-600">{children}</em>,
                  code: ({ children }) => <code className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded">{children}</code>,
                  pre: ({ children }) => <pre className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto my-2">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-300 pl-3 text-slate-500 italic my-2">{children}</blockquote>,
                }}
              >{message.content}</ReactMarkdown>
            </div>
          ) : (
            <ThinkingDots />
          )}
          {isStreaming && message.content && (
            <span className="inline-block w-0.5 h-3.5 bg-indigo-500 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "800ms" }}
        />
      ))}
    </div>
  );
}
