/**
 * Camada de abstração de IA — suporta Manus, Claude, Gemini e GPT.
 * Sempre retorna o conteúdo como string.
 */

export type AIProvider = "manus" | "claude" | "gemini" | "gpt";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  manus:  "gemini-2.5-flash",
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash",
  gpt:    "gpt-4o-mini",
};

const PROVIDER_URLS: Record<AIProvider, string> = {
  manus:  "https://forge.manus.im/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  gpt:    "https://api.openai.com/v1/chat/completions",
};

/** Chama a IA com o config do usuário e retorna o conteúdo como string. */
export async function callAI(config: AIConfig, messages: AIMessage[]): Promise<string> {
  const model = config.model || DEFAULT_MODELS[config.provider];

  if (config.provider === "claude") {
    return callClaude(config.apiKey, model, messages);
  }
  return callOpenAICompat(config.provider, config.apiKey, model, messages);
}

/** Claude usa formato próprio (Anthropic Messages API) */
async function callClaude(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  // Separa system messages do restante
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    messages: userMessages,
  };
  if (systemMsg) body.system = systemMsg;

  const response = await fetch(PROVIDER_URLS.claude, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text ?? "";
}

/** Manus, Gemini, GPT — todos usam formato OpenAI */
async function callOpenAICompat(provider: AIProvider, apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const response = await fetch(PROVIDER_URLS[provider], {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${provider} API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  return typeof content === "string" ? content : JSON.stringify(content);
}

/** Teste rápido de conectividade — retorna true se a IA respondeu */
export async function testAIConnection(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await callAI(config, [
      { role: "user", content: 'Responda apenas com o JSON: {"status":"ok"}' },
    ]);
    const ok = result.includes("ok");
    return { ok, message: ok ? "Conexão bem-sucedida!" : `Resposta inesperada: ${result.slice(0, 100)}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro desconhecido" };
  }
}
