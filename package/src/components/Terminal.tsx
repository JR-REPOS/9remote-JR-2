import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getSocket } from "../lib/socket";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  onOutput: (output: string) => void;
  onCwdChange: (cwd: string) => void;
}

export default function TerminalView({ sessionId, onOutput, onCwdChange }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const outputBufferRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: "#000000",
        foreground: "#e0e0e0",
        cursor: "#FF6A3D",
        selectionBackground: "rgba(255, 106, 61, 0.25)",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const socket = getSocket();

    const handleData = (data: string) => {
      term.write(data);
      outputBufferRef.current += data;
      if (outputBufferRef.current.length > 50000) {
        outputBufferRef.current = outputBufferRef.current.slice(-30000);
      }
      onOutput(outputBufferRef.current);
    };

    const handleCwdChange = (data: { sessionId: string; cwd: string }) => {
      if (data.sessionId === sessionId) {
        onCwdChange(data.cwd);
      }
    };

    const handleSessionClosed = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        term.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");
      }
    };

    socket.on("output", handleData);
    socket.on("cwdChange", handleCwdChange);
    socket.on("sessionClosed", handleSessionClosed);

    term.onData((data) => {
      socket.emit("input", { sessionId, data });
    });

    term.onResize(({ cols, rows }) => {
      socket.emit("resize", { sessionId, cols, rows });
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitRef.current) {
        fitRef.current.fit();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      socket.off("output", handleData);
      socket.off("cwdChange", handleCwdChange);
      socket.off("sessionClosed", handleSessionClosed);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId, onOutput, onCwdChange]);

  const fit = useCallback(() => {
    if (fitRef.current && containerRef.current) {
      fitRef.current.fit();
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fit, 50);
    return () => clearTimeout(timer);
  }, [fit]);

  return <div ref={containerRef} className="terminal-container" />;
}
