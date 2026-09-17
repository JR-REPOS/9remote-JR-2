export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  model: string;
  content: string;
  terminal_context?: string | null;
  command_executed?: string | null;
  created_at: string;
}

export interface TerminalSession {
  id: string;
  name: string;
  shellId?: string;
  shellLabel?: string;
  cwd?: string;
}

export interface AIModel {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const AI_MODELS: AIModel[] = [
  { id: "claude", label: "Claude", icon: "claude", description: "Anthropic Claude" },
  { id: "gemini", label: "Gemini", icon: "gemini", description: "Google Gemini" },
  { id: "codex", label: "Codex", icon: "codex", description: "OpenAI Codex" },
  { id: "opencode", label: "OpenCode", icon: "opencode", description: "OpenCode AI" },
];
