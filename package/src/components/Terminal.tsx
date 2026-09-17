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

    // Guard proposeDimensions and fit against unready or unmounted renderService
    const origProposeDimensions = fit.proposeDimensions.bind(fit);
    fit.proposeDimensions = () => {
      try {
        const container = containerRef.current;
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
          return undefined;
        }
        const core = (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } } })._core;
        if (!core?._renderService?.dimensions?.css?.cell?.width || !core?._renderService?.dimensions?.css?.cell?.height) {
          return undefined;
        }
        return origProposeDimensions();
      } catch {
        return undefined;
      }
    };

    const origFit = fit.fit.bind(fit);
    fit.fit = () => {
      try {
        const container = containerRef.current;
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
          return;
        }
        const core = (term as unknown as { _core?: { _renderService?: { dimensions?: unknown } } })._core;
        if (!core?._renderService?.dimensions) {
          return;
        }
        origFit();
      } catch {
        // Suppress fit errors during transitions or before render engine is ready
      }
    };

    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;

    // Deferred fit once layout and fonts are rendered
    requestAnimationFrame(() => {
      if (fitRef.current && containerRef.current) {
        fitRef.current.fit();
      }
    });

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

    let resizeRafId: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect && (entry.contentRect.width <= 0 || entry.contentRect.height <= 0)) {
        return;
      }
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (fitRef.current && termRef.current && containerRef.current) {
          fitRef.current.fit();
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      socket.off("output", handleData);
      socket.off("cwdChange", handleCwdChange);
      socket.off("sessionClosed", handleSessionClosed);
      resizeObserver.disconnect();
      fitRef.current = null;
      termRef.current = null;
      try {
        term.dispose();
      } catch {
        // Ignore dispose errors
      }
    };
  }, [sessionId, onOutput, onCwdChange]);

  const fit = useCallback(() => {
    if (fitRef.current && containerRef.current && termRef.current) {
      fitRef.current.fit();
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fit, 100);
    return () => clearTimeout(timer);
  }, [fit]);

  return <div ref={containerRef} className="terminal-container" />;
}
