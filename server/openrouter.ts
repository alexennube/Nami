import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";
import { getToolsForLLM, executeToolCall, getEnabledTools, getToolByName } from "./tools";
import { engineMind } from "./engine-mind";
import { createGeminiClient } from "./gemini";

export type InferenceProvider = "openrouter" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export type StreamEvent =
  | { type: "tool_start"; name: string; round: number; args?: Record<string, any> }
  | { type: "tool_result"; name: string; round: number; resultPreview?: string }
  | { type: "thinking"; content: string; round: number }
  | { type: "text_delta"; content: string }
  | { type: "text_done"; content: string };

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  useTools?: boolean;
  maxToolRounds?: number;
  provider?: InferenceProvider;
  excludeTools?: string[];
  onStream?: (event: StreamEvent) => void;
}

export async function getApiKey(): Promise<string> {
  const config = await storage.getConfig();
  const envKey = process.env.OPENROUTER_API_KEY;
  const configKey = config.openRouterApiKey;
  const key = (envKey && envKey.length > 10) ? envKey : (configKey && configKey !== "sk-or-v1-****" && configKey.length > 10) ? configKey : undefined;
  if (!key) {
    throw new Error("OpenRouter API key not configured. Set it in Settings or as OPENROUTER_API_KEY environment variable.");
  }
  return key;
}

export async function createOpenRouterClient(): Promise<OpenAI> {
  const config = await storage.getConfig();
  const apiKey = await getApiKey();

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.siteName,
    },
  });
}

export interface ChatResult {
  content: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  toolCalls?: Array<{ name: string; args: any; result: string }>;
}

let modelPricingCache: Map<string, { prompt: number; completion: number }> = new Map();
let pricingLastFetched = 0;
const PRICING_TTL = 6 * 60 * 60 * 1000;

export async function fetchModelPricing(): Promise<Map<string, { prompt: number; completion: number }>> {
  if (modelPricingCache.size > 0 && Date.now() - pricingLastFetched < PRICING_TTL) {
    return modelPricingCache;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const data = await res.json();
    const cache = new Map<string, { prompt: number; completion: number }>();
    for (const m of data.data || []) {
      if (m.id && m.pricing) {
        cache.set(m.id, {
          prompt: parseFloat(m.pricing.prompt) || 0,
          completion: parseFloat(m.pricing.completion) || 0,
        });
      }
    }
    modelPricingCache = cache;
    pricingLastFetched = Date.now();
    log(`Fetched pricing for ${cache.size} models`, "openrouter");
    return cache;
  } catch (err: any) {
    log(`Failed to fetch model pricing: ${err.message}`, "openrouter");
    return modelPricingCache;
  }
}

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  if (modelPricingCache.size === 0) {
    fetchModelPricing().catch(() => {});
  }
  const pricing = modelPricingCache.get(model);
  if (!pricing) return 0;
  return (promptTokens * pricing.prompt) + (completionTokens * pricing.completion);
}

export async function createInferenceClient(provider: InferenceProvider): Promise<OpenAI> {
  if (provider === "gemini") {
    return createGeminiClient();
  }
  return createOpenRouterClient();
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const config = await storage.getConfig();
  const provider = options.provider || config.namiProvider || "openrouter";
  const client = await createInferenceClient(provider);

  let model = options.model || config.defaultModel;
  if (provider === "openrouter" && model && !model.includes("/")) {
    model = `google/${model}`;
    log(`Auto-prefixed model ID: ${model}`, "openrouter");
  }
  const temperature = options.temperature ?? config.temperature;
  const maxTokens = options.maxTokens || config.maxTokensPerRequest;
  const useTools = options.useTools ?? false;
  const maxToolRounds = options.maxToolRounds ?? 5;

  const excludeSet = new Set(options.excludeTools || []);
  const enabledTools = getEnabledTools().filter(t => !excludeSet.has(t.name));
  const hasTools = useTools && enabledTools.length > 0;
  const toolDefs = hasTools ? enabledTools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  })) : undefined;

  log(`${provider} request: model=${model}, messages=${messages.length}, tools=${hasTools ? enabledTools.length : 0}`, "openrouter");

  const allToolCalls: Array<{ name: string; args: any; result: string }> = [];
  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalContent = "";

  const conversationMessages: any[] = [...messages];

  try {
    for (let round = 0; round <= maxToolRounds; round++) {
      const requestParams: any = {
        model,
        messages: conversationMessages,
        temperature,
        max_tokens: maxTokens,
      };

      if (hasTools && round < maxToolRounds) {
        requestParams.tools = toolDefs;
        requestParams.tool_choice = "auto";
      }

      const response = await client.chat.completions.create(requestParams);
      totalTokens += response.usage?.total_tokens || 0;
      totalPromptTokens += response.usage?.prompt_tokens || 0;
      totalCompletionTokens += response.usage?.completion_tokens || 0;

      const choice = response.choices[0];
      if (!choice) break;

      const message = choice.message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        if (message.content) {
          options.onStream?.({ type: "thinking", content: message.content, round });
        }

        conversationMessages.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls,
        });

        for (const tc of message.tool_calls as any[]) {
          const fnName = tc.function?.name || tc.name || "";
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(tc.function?.arguments || tc.arguments || "{}");
          } catch (parseErr: any) {
            const errResult = `Error: Failed to parse tool arguments: ${parseErr.message}`;
            allToolCalls.push({ name: fnName, args: {}, result: errResult });
            conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: errResult });
            continue;
          }

          log(`Tool call: ${fnName}(${JSON.stringify(fnArgs).substring(0, 80)})`, "openrouter");
          options.onStream?.({ type: "tool_start", name: fnName, round, args: fnArgs });

          let result: string;
          if (engineMind.isInitialized()) {
            const healResult = await engineMind.executeWithHealing(fnName, fnArgs);
            result = healResult.result;
            if (healResult.healed) {
              log(`Engine Mind healed tool ${fnName}: ${healResult.healDetails?.substring(0, 100)}`, "openrouter");
            }
          } else {
            result = await executeToolCall(fnName, fnArgs);
          }
          allToolCalls.push({ name: fnName, args: fnArgs, result: result.substring(0, 500) });
          options.onStream?.({ type: "tool_result", name: fnName, round, resultPreview: result.substring(0, 150) });

          conversationMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }

        continue;
      }

      finalContent = message.content || "";
      break;
    }

    if (!finalContent && allToolCalls.length > 0) {
      finalContent = `Executed ${allToolCalls.length} tool call(s): ${allToolCalls.map((tc) => tc.name).join(", ")}.`;
    }

    if (finalContent) {
      options.onStream?.({ type: "text_done", content: finalContent });
    }

    log(`${provider} response: ${totalTokens} tokens (${totalPromptTokens}p/${totalCompletionTokens}c), ${allToolCalls.length} tool calls`, "openrouter");

    return {
      content: finalContent,
      tokensUsed: totalTokens,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      model,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  } catch (error: any) {
    log(`${provider} error: ${error.message}`, "openrouter");
    throw new Error(`${provider} API error: ${error.message}`);
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
