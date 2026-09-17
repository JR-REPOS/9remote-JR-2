import { CustomAIProvider, AI_MODELS } from "../types";

const STORAGE_KEY = "9remote-custom-ai-providers";
const ACTIVE_PROVIDER_KEY = "9remote-active-provider-id";
const SELECTED_DEFAULT_MODEL_KEY = "9remote-selected-model";

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  modelId: string;
  placeholderKey?: string;
  requiresKey: boolean;
  hint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o",
    placeholderKey: "sk-...",
    requiresKey: true,
    hint: "Official OpenAI API (GPT-4o, GPT-4o-mini)",
  },
  {
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    modelId: "llama3.2",
    placeholderKey: "Not needed for local Ollama",
    requiresKey: false,
    hint: "Local inference without API keys (ollama run llama3.2)",
  },
  {
    name: "Groq Cloud",
    baseUrl: "https://api.groq.com/openai/v1",
    modelId: "llama-3.3-70b-versatile",
    placeholderKey: "gsk_...",
    requiresKey: true,
    hint: "Ultra-fast LPU inference (Llama 3.3, Mixtral)",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "anthropic/claude-3.5-sonnet",
    placeholderKey: "sk-or-...",
    requiresKey: true,
    hint: "Universal gateway to Claude, Llama, Gemini, and Mistral",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-chat",
    placeholderKey: "sk-...",
    requiresKey: true,
    hint: "DeepSeek-V3 and DeepSeek-R1 models",
  },
];

export function getCustomProviders(): CustomAIProvider[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error("Failed to read custom providers from localStorage", err);
    return [];
  }
}

export function saveCustomProvider(provider: CustomAIProvider): CustomAIProvider[] {
  try {
    const list = getCustomProviders();
    const existingIndex = list.findIndex((p) => p.id === provider.id);
    const updated: CustomAIProvider = {
      ...provider,
      updatedAt: new Date().toISOString(),
      createdAt: provider.createdAt || new Date().toISOString(),
    };

    let nextList: CustomAIProvider[];
    if (existingIndex >= 0) {
      nextList = [...list];
      nextList[existingIndex] = updated;
    } else {
      nextList = [...list, updated];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
    return nextList;
  } catch (err) {
    console.error("Failed to save custom provider to localStorage", err);
    return getCustomProviders();
  }
}

export function deleteCustomProvider(id: string): CustomAIProvider[] {
  try {
    const list = getCustomProviders();
    const nextList = list.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));

    if (getActiveCustomProviderId() === id) {
      setActiveCustomProviderId(null);
    }

    return nextList;
  } catch (err) {
    console.error("Failed to delete custom provider from localStorage", err);
    return getCustomProviders();
  }
}

export function getActiveCustomProviderId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROVIDER_KEY);
  } catch {
    return null;
  }
}

export function setActiveCustomProviderId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    }
    window.dispatchEvent(new Event("9remote-model-changed"));
  } catch (err) {
    console.error("Failed to set active provider ID", err);
  }
}

export function updateProviderValidation(
  id: string,
  validation: { ok: boolean; timestamp?: number; latency?: number; message?: string; error?: string }
): CustomAIProvider[] {
  try {
    const list = getCustomProviders();
    const index = list.findIndex((p) => p.id === id);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        lastValidation: {
          ...validation,
          timestamp: validation.timestamp || Date.now(),
        },
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event("9remote-providers-changed"));
      window.dispatchEvent(new Event("9remote-model-changed"));
    }
    return list;
  } catch (err) {
    console.error("Failed to update provider validation", err);
    return getCustomProviders();
  }
}

export function getSelectedDefaultModel(): string {
  try {
    return localStorage.getItem(SELECTED_DEFAULT_MODEL_KEY) || "claude";
  } catch {
    return "claude";
  }
}

export function setSelectedDefaultModel(modelId: string): void {
  try {
    localStorage.setItem(SELECTED_DEFAULT_MODEL_KEY, modelId);
    window.dispatchEvent(new Event("9remote-model-changed"));
  } catch (err) {
    console.error("Failed to set selected default model", err);
  }
}

export function getActiveModelInfo(): {
  id: string;
  label: string;
  modelIdentifier: string;
  isCustom: boolean;
  provider?: CustomAIProvider;
} {
  const customList = getCustomProviders();
  const activeCustomId = getActiveCustomProviderId();
  if (activeCustomId) {
    const found = customList.find((p) => p.id === activeCustomId);
    if (found) {
      return {
        id: `custom:${found.id}`,
        label: `${found.name} (${found.modelId})`,
        modelIdentifier: found.modelId,
        isCustom: true,
        provider: found,
      };
    }
  }

  const defaultId = getSelectedDefaultModel();
  const defaultModel = AI_MODELS.find((m) => m.id === defaultId) || AI_MODELS[0];
  return {
    id: defaultModel.id,
    label: defaultModel.label,
    modelIdentifier: defaultModel.id,
    isCustom: false,
  };
}

export async function testProviderConnection(provider: {
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<{ ok: boolean; message?: string; error?: string; latency?: number }> {
  try {
    const res = await fetch("/api/custom-provider/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        modelId: provider.modelId,
      }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || "Failed to reach backend test endpoint",
    };
  }
}
