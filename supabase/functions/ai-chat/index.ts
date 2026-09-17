import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequest {
  message: string;
  model: string;
  terminal_context?: string | null;
  history?: Array<{ role: string; content: string }>;
}

const SYSTEM_PROMPT = `You are an AI assistant integrated into a remote terminal application (9Remote).
You help users with terminal commands, debugging, code editing, and system administration.

When the user shares terminal output or context, analyze it and provide helpful guidance.
When suggesting commands, wrap them in bash code blocks like:
\`\`\`bash
command here
\`\`\`

The user can click "Run" on any bash code block to execute it directly in their terminal.
Keep responses concise and practical. If the user asks about errors, explain the cause and suggest a fix command.

Available models: claude, gemini, codex, opencode.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { message, model, terminal_context, history } = await req.json() as ChatRequest;

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let contextSection = "";
    if (terminal_context) {
      const trimmed = terminal_context.slice(-3000);
      contextSection = `\n\n--- Current Terminal Output ---\n${trimmed}\n--- End Terminal Output ---\n\nUse this terminal context to help answer the user's question. If they're asking about an error, look for it in the output above.`;
    }

    const conversationHistory = (history || [])
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = `${SYSTEM_PROMPT}\n\n${conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n` : ""}User: ${message}${contextSection}`;

    const modelMap: Record<string, { provider: string; name: string }> = {
      claude: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
      gemini: { provider: "google", name: "gemini-2.0-flash" },
      codex: { provider: "openai", name: "gpt-4o" },
      opencode: { provider: "openai", name: "gpt-4o-mini" },
    };

    const modelInfo = modelMap[model] || modelMap.claude;
    const responseText = await callAI(modelInfo, fullPrompt);

    return new Response(
      JSON.stringify({ response: responseText, model: model }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callAI(modelInfo: { provider: string; name: string }, prompt: string): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const googleKey = Deno.env.get("GOOGLE_API_KEY");

  if (modelInfo.provider === "anthropic" && anthropicKey) {
    return callAnthropic(anthropicKey, modelInfo.name, prompt);
  } else if (modelInfo.provider === "openai" && openaiKey) {
    return callOpenAI(openaiKey, modelInfo.name, prompt);
  } else if (modelInfo.provider === "google" && googleKey) {
    return callGoogle(googleKey, modelInfo.name, prompt);
  }

  return `I'm configured to use ${modelInfo.provider} (${modelInfo.name}), but no API key is set for that provider. 

To enable AI chat:
1. Add an API key as an edge function secret (e.g., ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)
2. Select a different model in the dropdown

In the meantime, I can still help you understand your terminal output. Here's what I see:

${prompt.slice(-500)}`;
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.content?.map((c: { text: string }) => c.text).join("") || "";
  return text;
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGoogle(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
