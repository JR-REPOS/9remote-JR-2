import { ChatMessage, CustomAIProvider } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  /^https:\/\/[^/]+$/.test(supabaseUrl) &&
  !supabaseUrl.includes("placeholder")
);
const EDGE_FUNCTION_URL = hasSupabaseConfig
  ? `${supabaseUrl}/functions/v1/ai-chat`
  : "/api/chat";

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export async function sendChatMessage(
  message: string,
  model: string,
  terminalContext: string | null,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  customProvider?: CustomAIProvider | null
): Promise<void> {
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        model,
        terminal_context: terminalContext,
        history: history.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        custom_provider: customProvider
          ? {
              name: customProvider.name,
              baseUrl: customProvider.baseUrl,
              apiKey: customProvider.apiKey,
              modelId: customProvider.modelId,
            }
          : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      callbacks.onError(`AI request failed (${response.status}): ${errText}`);
      return;
    }

    const data = await response.json();
    if (data.error) {
      callbacks.onError(data.error);
      return;
    }

    callbacks.onDone(data.response || "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    callbacks.onError(msg);
  }
}

export function extractCodeBlocks(text: string): Array<{ language: string; code: string; startIndex: number; endIndex: number }> {
  const blocks: Array<{ language: string; code: string; startIndex: number; endIndex: number }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "bash",
      code: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  return blocks;
}
