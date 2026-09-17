import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Terminal, Sparkles, ChevronDown, ChevronUp, Eye, Play, Bot } from "lucide-react";
import { ChatMessage, AI_MODELS } from "../types";
import { sendChatMessage, extractCodeBlocks } from "../lib/ai";
import { supabase } from "../lib/supabase";

interface ChatBoxProps {
  sessionId: string;
  terminalOutput: string;
  cwd: string;
  onRunCommand: (command: string) => void;
}

export default function ChatBox({ sessionId, terminalOutput, cwd, onRunCommand }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data && data.length > 0) {
      setMessages(data as ChatMessage[]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const context = includeContext ? terminalOutput.slice(-5000) : null;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "user",
      model: selectedModel,
      content: trimmed,
      terminal_context: context,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      model: selectedModel,
      content: trimmed,
      terminal_context: context,
    });

    await sendChatMessage(trimmed, selectedModel, context, messages, {
      onToken: () => {},
      onDone: async (fullText) => {
        const aiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: "assistant",
          model: selectedModel,
          content: fullText,
          terminal_context: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setLoading(false);

        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          model: selectedModel,
          content: fullText,
        });
      },
      onError: (error) => {
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: "assistant",
          model: selectedModel,
          content: `Error: ${error}`,
          terminal_context: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setLoading(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRunCommand = async (command: string, messageId: string) => {
    onRunCommand(command);
    await supabase
      .from("chat_messages")
      .update({ command_executed: command })
      .eq("id", messageId);
  };

  const currentModel = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  return (
    <div className="chat-section">
      <div className="chat-section-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="chat-section-title">
          <Bot size={16} style={{ color: "var(--brand-500)" }} />
          AI Assistant
          {messages.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 400 }}>
              {messages.length} messages
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button className="model-selector" onClick={() => setShowModelDropdown(!showModelDropdown)}>
              <Sparkles size={13} />
              {currentModel.label}
              <ChevronDown size={12} />
            </button>
            {showModelDropdown && (
              <div className="model-dropdown">
                {AI_MODELS.map((model) => (
                  <div
                    key={model.id}
                    className={`model-option ${model.id === selectedModel ? "active" : ""}`}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelDropdown(false);
                    }}
                  >
                    <div className="model-option-icon">
                      <ModelIcon modelId={model.id} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{model.label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>{model.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {!collapsed && (
        <div className="chat-section-body">
          <div className="chat-messages">
            {messages.length === 0 && !loading && (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <Bot size={24} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>
                  AI Assistant Ready
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 260 }}>
                  Ask questions about your terminal, request commands, debug errors, or get help with your code.
                  The AI can see your terminal output and suggest commands to run.
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageRenderer key={msg.id} message={msg} onRunCommand={handleRunCommand} />
            ))}

            {loading && (
              <div className="chat-message">
                <div className="message-avatar ai">
                  <ModelIcon modelId={selectedModel} />
                </div>
                <div className="message-body">
                  <div className="message-role">
                    {currentModel.label}
                  </div>
                  <div className="message-loading">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-context-toggle">
              <button
                onClick={() => setIncludeContext(!includeContext)}
                className={`context-chip ${includeContext ? "active" : ""}`}
                style={{
                  cursor: "pointer",
                  border: "none",
                  background: includeContext ? "rgba(var(--success-rgb), 0.15)" : "var(--surface-3)",
                  color: includeContext ? "var(--success)" : "var(--text-subtle)",
                }}
              >
                <Eye size={11} />
                {includeContext ? "Terminal context on" : "Context off"}
              </button>
              {cwd && (
                <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {cwd}
                </span>
              )}
            </div>
            <div className="chat-input-wrapper">
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask AI about your terminal, request a command, debug an error..."
                rows={1}
                style={{
                  height: Math.min(textareaRef.current?.scrollHeight || 32, 120),
                }}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRenderer({
  message,
  onRunCommand,
}: {
  message: ChatMessage;
  onRunCommand: (command: string, messageId: string) => void;
}) {
  const codeBlocks = extractCodeBlocks(message.content);
  const modelLabel = AI_MODELS.find((m) => m.id === message.model)?.label || message.model;

  if (message.role === "user") {
    return (
      <div className="chat-message">
        <div className="message-avatar user">U</div>
        <div className="message-body">
          <div className="message-role">
            You
            {message.terminal_context && (
              <span className="message-context-badge">
                <Terminal size={10} /> context
              </span>
            )}
          </div>
          <div className="message-content">{message.content}</div>
        </div>
      </div>
    );
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  codeBlocks.forEach((block, i) => {
    if (block.startIndex > lastEnd) {
      parts.push(
        <div key={`text-${i}`} className="message-content" style={{ marginBottom: 8 }}>
          {message.content.slice(lastEnd, block.startIndex).trim()}
        </div>
      );
    }
    const isRunnable = block.language === "bash" || block.language === "sh" || block.language === "shell";
    parts.push(
      <div key={`code-${i}`} className="message-code-block">
        <div className="message-code-header">
          <span>{block.language}</span>
          {isRunnable && (
            <button
              className="message-code-run"
              onClick={() => onRunCommand(block.code, message.id)}
              disabled={!!message.command_executed}
            >
              <Play size={10} />
              {message.command_executed ? "Ran" : "Run"}
            </button>
          )}
        </div>
        <pre className="message-code-content">{block.code}</pre>
      </div>
    );
    lastEnd = block.endIndex;
  });
  if (lastEnd < message.content.length) {
    parts.push(
      <div key="text-final" className="message-content">
        {message.content.slice(lastEnd).trim()}
      </div>
    );
  }

  return (
    <div className="chat-message">
      <div className="message-avatar ai">
        <ModelIcon modelId={message.model} />
      </div>
      <div className="message-body">
        <div className="message-role">
          {modelLabel}
          {message.command_executed && (
            <span className="message-context-badge" style={{ color: "var(--success)" }}>
              <Play size={10} /> executed
            </span>
          )}
        </div>
        {parts}
      </div>
    </div>
  );
}

function ModelIcon({ modelId }: { modelId: string }) {
  const icons: Record<string, string> = {
    claude: "C",
    gemini: "G",
    codex: "O",
    opencode: "O",
  };
  return (
    <span style={{ fontSize: 12, fontWeight: 700 }}>{icons[modelId] || "A"}</span>
  );
}
