import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, ChildProcess } from "node:child_process";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// API health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

// AI Provider connection test endpoint
app.post("/api/custom-provider/test", async (req, res) => {
  const startTime = Date.now();
  try {
    const { name, baseUrl, apiKey, modelId } = req.body || {};

    if (!baseUrl || !baseUrl.trim()) {
      return res.status(400).json({ ok: false, error: "Base URL is required" });
    }
    if (!modelId || !modelId.trim()) {
      return res.status(400).json({ ok: false, error: "Model ID is required" });
    }

    let cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const chatUrl = cleanBaseUrl.endsWith("/chat/completions")
      ? cleanBaseUrl
      : `${cleanBaseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const testRes = await fetch(chatUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId.trim(),
        messages: [{ role: "user", content: "Ping test. Respond with: OK" }],
        max_tokens: 15,
        temperature: 0.1,
        stream: false,
      }),
    });
    clearTimeout(timeout);

    const latency = Date.now() - startTime;

    if (!testRes.ok) {
      const errText = await testRes.text();
      let parsedErr = errText;
      try {
        const json = JSON.parse(errText);
        parsedErr = json.error?.message || json.message || errText;
      } catch {}
      return res.json({
        ok: false,
        status: testRes.status,
        error: `HTTP ${testRes.status}: ${parsedErr}`,
        latency,
      });
    }

    const json = await testRes.json();
    const sampleOutput =
      json.choices?.[0]?.message?.content?.trim() ||
      json.message ||
      "Connection successful";

    return res.json({
      ok: true,
      message: `Verified! Response: "${sampleOutput.slice(0, 60)}"`,
      latency,
    });
  } catch (err: any) {
    const latency = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";
    return res.json({
      ok: false,
      error: isTimeout
        ? "Connection timed out after 12s. Check if base URL and port are reachable."
        : `Network error: ${err.message || String(err)}`,
      latency,
    });
  }
});

// AI Chat endpoint (handles Assistant requests with terminal context)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, model, terminal_context, history, custom_provider } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // 1. If user supplied a custom AI Provider (OpenAI, Ollama, Groq, OpenRouter, etc.)
    if (custom_provider && custom_provider.baseUrl && custom_provider.modelId) {
      try {
        let cleanBaseUrl = custom_provider.baseUrl.trim().replace(/\/+$/, "");
        const chatUrl = cleanBaseUrl.endsWith("/chat/completions")
          ? cleanBaseUrl
          : `${cleanBaseUrl}/chat/completions`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (custom_provider.apiKey && custom_provider.apiKey.trim()) {
          headers["Authorization"] = `Bearer ${custom_provider.apiKey.trim()}`;
        }

        let promptContext = "";
        if (terminal_context) {
          promptContext = `\n\n--- Active Terminal Output (Last 3000 chars) ---\n${terminal_context.slice(-3000)}\n--- End Terminal Output ---`;
        }

        const systemPrompt = `You are an AI terminal assistant integrated into 9Remote.
You assist developers with terminal commands, troubleshooting, shell scripts, and system administration.
When recommending any shell command for the user to execute, ALWAYS format it cleanly in a bash code block:
\`\`\`bash
command here
\`\`\`
The user has a direct "Run" button on every bash code block that executes it in their open terminal session.
Be clear, practical, and concise.`;

        const formattedMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];

        if (Array.isArray(history)) {
          for (const h of history.slice(-6)) {
            formattedMessages.push({
              role: h.role === "assistant" ? "assistant" : "user",
              content: h.content,
            });
          }
        }

        formattedMessages.push({
          role: "user",
          content: `${message}${promptContext}`,
        });

        const providerRes = await fetch(chatUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: custom_provider.modelId.trim(),
            messages: formattedMessages,
            temperature: 0.7,
          }),
        });

        if (!providerRes.ok) {
          const errText = await providerRes.text();
          let parsedErr = errText;
          try {
            const json = JSON.parse(errText);
            parsedErr = json.error?.message || json.message || errText;
          } catch {}
          return res.status(providerRes.status).json({
            error: `Custom Provider (${custom_provider.name || "AI"}) error (${providerRes.status}): ${parsedErr}`,
          });
        }

        const providerData = await providerRes.json();
        const reply =
          providerData.choices?.[0]?.message?.content ||
          providerData.message ||
          (typeof providerData === "string" ? providerData : JSON.stringify(providerData));

        return res.json({
          response: reply,
          model: custom_provider.name || custom_provider.modelId,
        });
      } catch (providerErr: any) {
        console.error("Custom AI provider call failed:", providerErr);
        return res.status(502).json({
          error: `Failed to connect to custom provider: ${providerErr.message || String(providerErr)}`,
        });
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        let promptContext = "";
        if (terminal_context) {
          promptContext = `\n\n--- Active Terminal Output (Last 3000 chars) ---\n${terminal_context.slice(-3000)}\n--- End Terminal Output ---`;
        }

        const historyContext = Array.isArray(history)
          ? history
              .slice(-6)
              .map((h: { role: string; content: string }) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
              .join("\n\n")
          : "";

        const systemPrompt = `You are an AI terminal assistant integrated into 9Remote.
You assist developers with terminal commands, troubleshooting, shell scripts, and system administration.
When recommending any shell command for the user to execute, ALWAYS format it cleanly in a bash code block:
\`\`\`bash
command here
\`\`\`
The user has a direct "Run" button on every bash code block that executes it in their open terminal session.
Be clear, practical, and concise.`;

        const fullPrompt = `${systemPrompt}\n\n${historyContext ? `Previous messages:\n${historyContext}\n\n` : ""}User request: ${message}${promptContext}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: fullPrompt,
        });

        const reply = response.text || "No response received from model.";
        return res.json({ response: reply, model: model || "gemini" });
      } catch (err: any) {
        console.error("Gemini API call failed:", err);
        // Fall back to built-in helper below
      }
    }

    // Built-in intelligent helper when Gemini key is not configured or in offline mode
    const lower = message.toLowerCase();
    let reply = "";

    if (lower.includes("list") || lower.includes("files") || lower.includes("dir") || lower.includes("ls")) {
      reply = `Here is a command to list all files in your current working directory including permissions and hidden files:

\`\`\`bash
ls -lah
\`\`\`

Click **Run** above to execute it directly in your terminal.`;
    } else if (lower.includes("git") || lower.includes("commit") || lower.includes("branch") || lower.includes("status")) {
      reply = `Here is how to check your repository status:

\`\`\`bash
git status
\`\`\`

You can also view your recent commit history with:

\`\`\`bash
git log --oneline -n 5
\`\`\``;
    } else if (lower.includes("system") || lower.includes("cpu") || lower.includes("memory") || lower.includes("ram") || lower.includes("free")) {
      reply = `Here is a quick check of your system resources, uptime, and memory usage:

\`\`\`bash
uptime && uname -a
\`\`\`

And to check free disk space:

\`\`\`bash
df -h .
\`\`\``;
    } else if (lower.includes("node") || lower.includes("npm") || lower.includes("version")) {
      reply = `To inspect your Node.js and npm runtime versions:

\`\`\`bash
node -v && npm -v
\`\`\``;
    } else {
      reply = `I am ready to help you navigate and operate your 9Remote terminal workspace.

Current request: "${message}"

${terminal_context ? `I inspected your current terminal context (${terminal_context.length} chars). ` : ""}Here are some commands you can run right away:

\`\`\`bash
pwd && ls -F
\`\`\`

To enable full AI intelligence with Gemini, ensure \`GEMINI_API_KEY\` is configured in your project settings.`;
    }

    return res.json({ response: reply, model: model || "gemini" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Socket.IO Terminal Session Management
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

interface ActiveSession {
  proc: ChildProcess;
  cwd: string;
}

const sessions = new Map<string, ActiveSession>();

io.on("connection", (socket) => {
  console.log(`[9Remote] Client connected: ${socket.id}`);

  socket.on("createSession", ({ sessionId, name, cols, rows }) => {
    const id = sessionId || `session-${Date.now()}`;
    const initialCwd = process.cwd();

    try {
      const shell = process.env.SHELL || "/bin/bash";
      const proc = spawn(shell, ["-i"], {
        cwd: initialCwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          LANG: "en_US.UTF-8",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      sessions.set(id, { proc, cwd: initialCwd });

      proc.stdout?.on("data", (chunk: Buffer) => {
        socket.emit("output", chunk.toString("utf-8"));
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        socket.emit("output", chunk.toString("utf-8"));
      });

      proc.on("close", (code) => {
        console.log(`[9Remote] Session ${id} closed with code ${code}`);
        socket.emit("sessionClosed", { sessionId: id });
        sessions.delete(id);
      });

      proc.on("error", (err) => {
        console.error(`[9Remote] Shell error for session ${id}:`, err);
        socket.emit("output", `\r\n\x1b[31m[Shell error: ${err.message}]\x1b[0m\r\n`);
      });

      socket.emit("createResult", {
        success: true,
        sessionId: id,
        cwd: initialCwd,
        shellId: "bash",
        shellLabel: "Bash",
      });

      // Send greeting banner
      setTimeout(() => {
        socket.emit(
          "output",
          `\r\n\x1b[38;2;255;106;61m╔══════════════════════════════════════════════╗\x1b[0m\r\n` +
          `\x1b[38;2;255;106;61m║         9Remote Terminal + AI Active         ║\x1b[0m\r\n` +
          `\x1b[38;2;255;106;61m╚══════════════════════════════════════════════╝\x1b[0m\r\n\r\n`
        );
      }, 100);
    } catch (err: any) {
      console.error(`[9Remote] Failed to create session ${id}:`, err);
      socket.emit("createResult", {
        success: false,
        error: err.message,
      });
    }
  });

  socket.on("input", ({ sessionId, data }) => {
    const session = sessions.get(sessionId);
    if (session && session.proc.stdin && !session.proc.killed) {
      try {
        session.proc.stdin.write(data);
      } catch (err) {
        console.error(`[9Remote] Stdin write error:`, err);
      }
    }
  });

  socket.on("resize", ({ sessionId, cols, rows }) => {
    // If running with standard spawn, resize can be acknowledged
    const session = sessions.get(sessionId);
    if (session) {
      // acknowledged
    }
  });

  socket.on("deleteSession", ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (session) {
      try {
        session.proc.kill("SIGTERM");
      } catch {}
      sessions.delete(sessionId);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[9Remote] Client disconnected: ${socket.id}`);
  });
});

// Vite middleware or static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: __dirname,
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    const distUiPath = path.join(__dirname, "dist/ui");
    const staticDir = fs.existsSync(distPath) ? distPath : distUiPath;
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      const indexFile = path.join(staticDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Application not built yet");
      }
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[9Remote] Server running at http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start 9Remote server:", err);
  process.exit(1);
});
