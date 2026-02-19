import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function createOpenRouterClient(): Promise<OpenAI> {
  const config = await storage.getConfig();
  const apiKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OpenRouter API key not configured. Set it in Settings or as OPENROUTER_API_KEY environment variable.");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.siteName,
    },
  });
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; tokensUsed: number }> {
  const config = await storage.getConfig();
  const client = await createOpenRouterClient();

  const model = options.model || config.defaultModel;
  const temperature = options.temperature ?? config.temperature;
  const maxTokens = options.maxTokens || config.maxTokensPerRequest;

  log(`OpenRouter request: model=${model}, messages=${messages.length}`, "openrouter");

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    const content = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    log(`OpenRouter response: ${tokensUsed} tokens used`, "openrouter");

    return { content, tokensUsed };
  } catch (error: any) {
    log(`OpenRouter error: ${error.message}`, "openrouter");
    throw new Error(`OpenRouter API error: ${error.message}`);
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await createOpenRouterClient();
    const response = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with exactly: NAMI_OK" }],
      max_tokens: 10,
    });

    const content = response.choices[0]?.message?.content || "";
    return { success: true, message: `Connection successful. Response: ${content}` };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}
