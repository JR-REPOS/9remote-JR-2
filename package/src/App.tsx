import { useState, useCallback, useEffect } from "react";
import type { MouseEvent } from "react";
import { Plus, X, Terminal as TerminalIcon, Moon, Sun, Wifi, WifiOff, Play, Bot, Sparkles, Command, Settings as SettingsIcon, CheckCircle2 } from "lucide-react";
import TerminalView from "./components/Terminal";
import ChatBox from "./components/ChatBox";
import SettingsModal from "./components/SettingsModal";
import { getSocket, disconnectSocket } from "./lib/socket";
import { TerminalSession } from "./types";
import { getActiveModelInfo } from "./lib/providers";

const QUICK_COMMAND_PLACEHOLDERS = [
  { label: "ls -lah", desc: "List files with details" },
  { label: "pwd", desc: "Show current path" },
  { label: "git status", desc: "Inspect git repository" },
  { label: "df -h", desc: "Check disk usage" },
  { label: "uptime", desc: "Check load & uptime" },
  { label: "clear", desc: "Clear terminal screen" },
];

export default function App() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("9remote-theme") as "dark" | "light") || "dark"
  );
  const [terminalOutput, setTerminalOutput] = useState<Record<string, string>>({});
  const [cwdMap, setCwdMap] = useState<Record<string, string>>({});
  const [quickCmd, setQuickCmd] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [activeModel, setActiveModel] = useState(getActiveModelInfo());

  useEffect(() => {
    const handleModelChange = () => {
      setActiveModel(getActiveModelInfo());
    };
    window.addEventListener("storage", handleModelChange);
    window.addEventListener("9remote-model-changed", handleModelChange);
    window.addEventListener("9remote-providers-changed", handleModelChange);
    return () => {
      window.removeEventListener("storage", handleModelChange);
      window.removeEventListener("9remote-model-changed", handleModelChange);
      window.removeEventListener("9remote-providers-changed", handleModelChange);
    };
  }, []);

  const handleOutput = useCallback((output: string) => {
    setTerminalOutput((prev) => ({ ...prev, [activeSessionId || ""]: output }));
  }, [activeSessionId]);

  const handleCwdChange = useCallback((cwd: string) => {
    setCwdMap((prev) => ({ ...prev, [activeSessionId || ""]: cwd }));
  }, [activeSessionId]);

  const handleRunCommand = useCallback((command: string) => {
    const socket = getSocket();
    if (activeSessionId) {
      socket.emit("input", { sessionId: activeSessionId, data: command + "\n" });
    }
  }, [activeSessionId]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const [hasInitialized, setHasInitialized] = useState(false);

  const createSession = useCallback(async () => {
    const socket = getSocket();
    const sessionId = `session-${Date.now()}`;
    const name = `Terminal ${sessions.length + 1}`;

    socket.emit("createSession", {
      sessionId,
      name,
      cols: 80,
      rows: 24,
    });

    socket.once("createResult", (result: { success: boolean; sessionId?: string; error?: string; cwd?: string; shellId?: string; shellLabel?: string }) => {
      if (result.success && result.sessionId) {
        const newSession: TerminalSession = {
          id: result.sessionId,
          name,
          shellId: result.shellId,
          shellLabel: result.shellLabel,
          cwd: result.cwd,
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(result.sessionId);
        if (result.cwd) {
          setCwdMap((prev) => ({ ...prev, [result.sessionId!]: result.cwd! }));
        }
      }
    });
  }, [sessions.length]);

  useEffect(() => {
    if (connected && !hasInitialized && sessions.length === 0) {
      setHasInitialized(true);
      createSession();
    }
  }, [connected, hasInitialized, sessions.length, createSession]);

  const closeSession = useCallback((sessionId: string, e: MouseEvent) => {
    e.stopPropagation();
    const socket = getSocket();
    socket.emit("deleteSession", { sessionId });

    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });

    setTerminalOutput((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setCwdMap((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, [activeSessionId]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("9remote-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeOutput = activeSessionId ? terminalOutput[activeSessionId] || "" : "";
  const activeCwd = activeSessionId ? cwdMap[activeSessionId] || "" : "";

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <div className="app-logo-icon">
              <TerminalIcon size={16} color="white" />
            </div>
            9Remote
          </div>
          <div className={`status-pill`}>
            <div className={`status-dot ${connected ? "" : "offline"}`} />
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <div className="app-header-right">
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="AI Provider Settings">
            <SettingsIcon size={16} />
          </button>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-btn" onClick={() => createSession()} title="New terminal">
            <Plus size={16} />
          </button>
        </div>
      </header>

      <div className="app-body">
        <div className="terminal-panel">
          <div className="terminal-tabs">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`terminal-tab ${session.id === activeSessionId ? "active" : ""}`}
                onClick={() => setActiveSessionId(session.id)}
              >
                <TerminalIcon size={12} />
                {session.name}
                <button
                  className="terminal-tab-close"
                  onClick={(e) => closeSession(session.id, e)}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            <button className="terminal-new-btn" onClick={() => createSession()} title="New terminal">
              <Plus size={14} />
            </button>
          </div>

          <div className="terminal-with-chat">
            <div className="terminal-section">
              {activeSession ? (
                <>
                  <div className="terminal-quick-bar">
                    <div className="terminal-quick-input-wrap">
                      <TerminalIcon size={12} className="terminal-quick-icon" />
                      <input
                        type="text"
                        className="terminal-quick-input"
                        value={quickCmd}
                        onChange={(e) => setQuickCmd(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && quickCmd.trim()) {
                            handleRunCommand(quickCmd.trim());
                            setQuickCmd("");
                          }
                        }}
                        placeholder="Quick command (e.g. ls -lah, git status, df -h, node -v)..."
                      />
                      {quickCmd.trim() && (
                        <button
                          className="terminal-quick-run-btn"
                          onClick={() => {
                            handleRunCommand(quickCmd.trim());
                            setQuickCmd("");
                          }}
                        >
                          <Play size={10} />
                          Run
                        </button>
                      )}
                    </div>
                    <div className="terminal-quick-pills">
                      <span className="terminal-quick-label">Placeholders:</span>
                      {QUICK_COMMAND_PLACEHOLDERS.map((item) => (
                        <button
                          key={item.label}
                          className="terminal-quick-pill"
                          onClick={() => handleRunCommand(item.label)}
                          title={`${item.desc} — click to execute`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TerminalView
                    key={activeSession.id}
                    sessionId={activeSession.id}
                    onOutput={handleOutput}
                    onCwdChange={handleCwdChange}
                  />
                </>
              ) : (
                <div className="terminal-empty-state">
                  <div className="terminal-mockup">
                    <div className="terminal-mockup-header">
                      <div className="terminal-mockup-dots">
                        <span className="mockup-dot red" />
                        <span className="mockup-dot yellow" />
                        <span className="mockup-dot green" />
                      </div>
                      <span className="terminal-mockup-title">bash — 9remote workspace</span>
                    </div>
                    <div className="terminal-mockup-body">
                      <div className="mockup-line">
                        <span className="mockup-host">9remote@cloud</span>:<span className="mockup-path">~</span>$ <span className="mockup-cmd">status --all</span>
                      </div>
                      <div className="mockup-output">
                        ✓ Interactive terminal engine ready (Socket.IO + PTY streaming)<br />
                        ✓ AI Terminal Assistant initialized with Gemini intelligence<br />
                        ✓ Click 'Open Terminal' or select a shortcut to begin
                      </div>
                      <div className="mockup-line">
                        <span className="mockup-host">9remote@cloud</span>:<span className="mockup-path">~</span>$ <span className="mockup-cursor">█</span>
                      </div>
                    </div>
                  </div>

                  <div className="terminal-empty-controls">
                    <button className="primary-action-btn" onClick={() => createSession()}>
                      <Plus size={15} /> Open Terminal Session
                    </button>
                    <div className="empty-shortcut-hints">
                      <span><kbd>Enter</kbd> Run command</span>
                      <span><kbd>Ctrl+C</kbd> Interrupt</span>
                      <span><kbd>Ctrl+L</kbd> Clear</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {activeSession ? (
              <ChatBox
                sessionId={activeSession.id}
                terminalOutput={activeOutput}
                cwd={activeCwd}
                onRunCommand={handleRunCommand}
                onOpenSettings={() => setShowSettings(true)}
              />
            ) : (
              <div className="chat-section chat-section-placeholder">
                <div
                  className="chat-section-header selected-chat-header"
                  onClick={() => setShowSettings(true)}
                  title="Current Active AI Model — Click to configure AI settings"
                >
                  <div className="chat-section-title">
                    <Sparkles size={14} color="var(--brand-500)" />
                    <span>AI Terminal Assistant</span>
                  </div>

                  {/* Active AI Model Indicator */}
                  <div className="chat-header-active-model">
                    <div className="active-model-chip" title={`Current active model: ${activeModel.label}`}>
                      <span className="active-model-status-dot" />
                      <span className="active-model-badge-type">
                        {activeModel.isCustom ? "Custom AI:" : "Active Model:"}
                      </span>
                      <span className="active-model-badge-name">{activeModel.label}</span>
                      {activeModel.isCustom && activeModel.provider?.lastValidation?.ok && (
                        <span title="Connection to custom provider verified" style={{ display: "inline-flex" }}>
                          <CheckCircle2 size={12} className="active-model-verified-icon" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="chat-placeholder-content">
                  <div className="chat-placeholder-icon-wrap">
                    <Bot size={24} />
                  </div>
                  <div
                    className="chat-empty-active-model"
                    id="chat-placeholder-active-model"
                    onClick={() => setShowSettings(true)}
                    title={`Active Model: ${activeModel.label} • Click to configure`}
                  >
                    <span className="chat-empty-model-indicator">▪</span>
                    <span className="chat-empty-model-name">{activeModel.label}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
                    AI Terminal Assistant Ready
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", maxWidth: 320, textAlign: "center" }}>
                    Start a terminal session to collaborate with AI models, or configure custom OpenAI/Ollama endpoints.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      onClick={() => createSession()}
                      className="chat-placeholder-btn"
                    >
                      <Plus size={13} /> Launch Session & Chat
                    </button>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="chat-placeholder-btn"
                      style={{ background: "var(--surface-3)", color: "var(--text-main)", borderColor: "var(--border)" }}
                    >
                      <SettingsIcon size={13} /> AI Settings
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom AI Provider Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
