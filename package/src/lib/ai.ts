import { ChatMessage } from "../types";

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

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
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message,
        model,
        terminal_context: terminalContext,
        history: history.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
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
