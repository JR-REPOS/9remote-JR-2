import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Terminal, Sparkles, ChevronDown, ChevronUp, Eye, Play, Bot, ArrowRight, CornerDownLeft, Cpu, Sliders } from "lucide-react";
import { ChatMessage, AI_MODELS, CustomAIProvider } from "../types";
import { sendChatMessage, extractCodeBlocks } from "../lib/ai";
import { supabase } from "../lib/supabase";
import {
  getCustomProviders,
  getActiveCustomProviderId,
  setActiveCustomProviderId,
  getSelectedDefaultModel,
  setSelectedDefaultModel,
} from "../lib/providers";

interface ChatBoxProps {
  sessionId: string;
  terminalOutput: string;
  cwd: string;
  onRunCommand: (command: string) => void;
  onOpenSettings?: () => void;
}

const PLACEHOLDER_CYCLE = [
  "Ask AI: 'Check CPU, memory & disk usage'...",
  "Ask AI: 'Find all .log files modified today'...",
  "Ask AI: 'Show git branch status & commit history'...",
  "Ask AI: 'Explain the error in my terminal output'...",
  "Ask AI: 'List active listening ports & sockets'...",
  "Ask AI: 'Help me write a shell script to automate this'...",
  "Ask AI: 'How do I monitor processes in real-time?'...",
];

const SUGGESTED_PLACEHOLDERS = [
  {
    icon: "⚡",
    label: "System Resources",
    description: "Uptime, memory & disk usage",
    prompt: "Check system uptime, memory usage, and available disk space",
  },
  {
    icon: "📂",
    label: "Find Large Files",
    description: "Inspect top 10 largest files",
    prompt: "Find the 10 largest files in the current directory and display their sizes",
  },
  {
    icon: "🌿",
    label: "Git Status",
    description: "Branch status & recent commits",
    prompt: "Show git status, branch details, and the last 3 commits",
  },
  {
    icon: "🌐",
    label: "Network Ports",
    description: "Active ports & listening services",
    prompt: "Check which ports and network services are currently listening",
  },
  {
    icon: "🔍",
    label: "Explain Terminal",
    description: "Diagnose terminal output & errors",
    prompt: "Explain the current terminal output and recommend any necessary follow-up commands",
  },
  {
    icon: "🧹",
    label: "Disk Cleanup",
    description: "Find & clean temporary caches",
    prompt: "Show how to find and safely clean temporary cache files and logs",
  },
];

export default function ChatBox({ sessionId, terminalOutput, cwd, onRunCommand, onOpenSettings }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [customProviders, setCustomProviders] = useState<CustomAIProvider[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshProviders = useCallback(() => {
    const list = getCustomProviders();
    setCustomProviders(list);
    const activeId = getActiveCustomProviderId();
    if (activeId) {
      const found = list.find((p) => p.id === activeId);
      if (found) {
        setSelectedModel(`custom:${found.id}`);
        return;
      }
    }
    const defaultModel = getSelectedDefaultModel();
    setSelectedModel(defaultModel);
  }, []);

  useEffect(() => {
    refreshProviders();
    const handleStorage = () => refreshProviders();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("9remote-model-changed", handleStorage);
    window.addEventListener("9remote-providers-changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("9remote-model-changed", handleStorage);
      window.removeEventListener("9remote-providers-changed", handleStorage);
    };
  }, [refreshProviders]);

  useEffect(() => {
    if (input) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_CYCLE.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [input]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (data && data.length > 0) {
        setMessages(data as ChatMessage[]);
      }
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeCustomProvider = selectedModel.startsWith("custom:")
    ? customProviders.find((p) => `custom:${p.id}` === selectedModel) || null
    : null;

  const currentModel = activeCustomProvider
    ? {
        id: `custom:${activeCustomProvider.id}`,
        label: activeCustomProvider.name,
        icon: "custom",
        description: `${activeCustomProvider.modelId} • ${activeCustomProvider.baseUrl}`,
      }
    : AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const context = includeContext ? terminalOutput.slice(-5000) : null;
    const modelNameToRecord = activeCustomProvider
      ? `${activeCustomProvider.name} (${activeCustomProvider.modelId})`
      : selectedModel;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "user",
      model: modelNameToRecord,
      content: trimmed,
      terminal_context: context,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "user",
        model: modelNameToRecord,
        content: trimmed,
        terminal_context: context,
      });
    } catch {}

    await sendChatMessage(
      trimmed,
      selectedModel,
      context,
      messages,
      {
        onToken: () => {},
        onDone: async (fullText) => {
          const aiMsg: ChatMessage = {
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: "assistant",
            model: modelNameToRecord,
            content: fullText,
            terminal_context: null,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setLoading(false);

          try {
            await supabase.from("chat_messages").insert({
              session_id: sessionId,
              role: "assistant",
              model: modelNameToRecord,
              content: fullText,
            });
          } catch {}
        },
        onError: (error) => {
          const errMsg: ChatMessage = {
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: "assistant",
            model: modelNameToRecord,
            content: `Error: ${error}`,
            terminal_context: null,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setLoading(false);
        },
      },
      activeCustomProvider
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRunCommand = async (command: string, messageId: string) => {
    onRunCommand(command);
    try {
      await supabase
        .from("chat_messages")
        .update({ command_executed: command })
        .eq("id", messageId);
    } catch {}
  };

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
              {activeCustomProvider ? <Cpu size={13} style={{ color: "var(--brand-500)" }} /> : <Sparkles size={13} />}
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
                      setSelectedDefaultModel(model.id);
                      setActiveCustomProviderId(null);
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

                {/* Custom AI Providers Section */}
                {customProviders.length > 0 && (
                  <>
                    <div className="model-dropdown-divider" />
                    <div className="model-dropdown-section-title">Custom AI Providers</div>
                    {customProviders.map((cp) => {
                      const isThisSelected = selectedModel === `custom:${cp.id}`;
                      return (
                        <div
                          key={cp.id}
                          className={`model-option ${isThisSelected ? "active" : ""}`}
                          onClick={() => {
                            setSelectedModel(`custom:${cp.id}`);
                            setActiveCustomProviderId(cp.id);
                            setShowModelDropdown(false);
                          }}
                        >
                          <div className="model-option-icon" style={{ color: "var(--brand-500)" }}>
                            <Cpu size={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{cp.name}</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  background: "var(--surface-3)",
                                  borderRadius: 3,
                                  fontFamily: "monospace",
                                }}
                              >
                                {cp.modelId}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-subtle)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cp.baseUrl}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {onOpenSettings && (
                  <>
                    <div className="model-dropdown-divider" />
                    <button
                      className="model-dropdown-manage-btn"
                      onClick={() => {
                        setShowModelDropdown(false);
                        onOpenSettings();
                      }}
                    >
                      <Sliders size={12} />
                      <span>Configure Custom Providers...</span>
                    </button>
                  </>
                )}
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
                  <Bot size={22} />
                </div>
                <div
                  className="chat-empty-active-model"
                  id="chat-empty-active-model"
                  onClick={() => setShowModelDropdown((prev) => !prev)}
                  title={`Active Model: ${
                    activeCustomProvider
                      ? `${activeCustomProvider.name} (${activeCustomProvider.modelId})`
                      : currentModel.label
                  } • Click to switch model`}
                >
                  <span className="chat-empty-model-indicator">▪</span>
                  <span className="chat-empty-model-name">
                    {activeCustomProvider
                      ? `${activeCustomProvider.name} (${activeCustomProvider.modelId})`
                      : currentModel.label}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>
                  AI Terminal Assistant Ready
                </div>
                <div style={{ fontSize: 12, color: "var(--text-subtle)", maxWidth: 380, textAlign: "center" }}>
                  Ask questions about your terminal, request commands, debug errors, or pick a suggested prompt below:
                </div>

                <div className="placeholder-prompt-grid">
                  {SUGGESTED_PLACEHOLDERS.map((item, idx) => (
                    <button
                      key={idx}
                      className="placeholder-prompt-card"
                      onClick={() => {
                        setInput(item.prompt);
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                        }
                      }}
                      title={`Click to fill: "${item.prompt}"`}
                    >
                      <span className="placeholder-prompt-icon">{item.icon}</span>
                      <div className="placeholder-prompt-text">
                        <span className="placeholder-prompt-title">{item.label}</span>
                        <span className="placeholder-prompt-desc">{item.description}</span>
                      </div>
                      <CornerDownLeft size={12} className="placeholder-prompt-arrow" />
                    </button>
                  ))}
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
                placeholder={PLACEHOLDER_CYCLE[placeholderIndex]}
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

  if (modelId.startsWith("custom:") || !icons[modelId]) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand-500)" }}>
        <Cpu size={14} />
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={`/agents/${modelId}.svg`}
        alt={modelId}
        style={{ width: 16, height: 16, borderRadius: 4 }}
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = "none";
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 700 }} className="model-fallback-char">
        {icons[modelId] || "A"}
      </span>
    </span>
  );
}
