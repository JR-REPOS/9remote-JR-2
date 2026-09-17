import { useState, useCallback, useEffect } from "react";
import { Plus, X, Terminal as TerminalIcon, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import TerminalView from "./components/Terminal";
import ChatBox from "./components/ChatBox";
import { getSocket, disconnectSocket } from "./lib/socket";
import { TerminalSession } from "./types";

export default function App() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("9remote-theme") as "dark" | "light") || "dark"
  );
  const [terminalOutput, setTerminalOutput] = useState<Record<string, string>>({});
  const [cwdMap, setCwdMap] = useState<Record<string, string>>({});

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

  const closeSession = useCallback((sessionId: string, e: React.MouseEvent) => {
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
                <TerminalView
                  key={activeSession.id}
                  sessionId={activeSession.id}
                  onOutput={handleOutput}
                  onCwdChange={handleCwdChange}
                />
              ) : (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  flexDirection: "column",
                  gap: 12,
                  color: "var(--text-subtle)",
                  background: "#000",
                }}>
                  <TerminalIcon size={40} style={{ opacity: 0.3 }} />
                  <div style={{ fontSize: 14, fontWeight: 500 }}>No terminal open</div>
                  <button
                    onClick={() => createSession()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      borderRadius: "var(--radius)",
                      border: "none",
                      background: "linear-gradient(135deg, var(--brand-500), var(--brand-400))",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px -4px rgba(var(--brand-rgb), 0.5)",
                    }}
                  >
                    <Plus size={15} /> Open Terminal
                  </button>
                </div>
              )}
            </div>

            {activeSession && (
              <ChatBox
                sessionId={activeSession.id}
                terminalOutput={activeOutput}
                cwd={activeCwd}
                onRunCommand={handleRunCommand}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
