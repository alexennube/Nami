import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";
import { getToolsForLLM, executeToolCall, getEnabledTools } from "./tools";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  useTools?: boolean;
  maxToolRounds?: number;
}

export async function getApiKey(): Promise<string> {
  const config = await storage.getConfig();
  const configKey = config.openRouterApiKey;
  const envKey = process.env.OPENROUTER_API_KEY;
  const key = (configKey && configKey !== "sk-or-v1-****" && configKey.length > 10) ? configKey : envKey;
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

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; tokensUsed: number; toolCalls?: Array<{ name: string; args: any; result: string }> }> {
  const config = await storage.getConfig();
  const client = await createOpenRouterClient();

  const model = options.model || config.defaultModel;
  const temperature = options.temperature ?? config.temperature;
  const maxTokens = options.maxTokens || config.maxTokensPerRequest;
  const useTools = options.useTools ?? false;
  const maxToolRounds = options.maxToolRounds ?? 5;

  const enabledTools = getEnabledTools();
  const hasTools = useTools && enabledTools.length > 0;
  const toolDefs = hasTools ? getToolsForLLM() : undefined;

  log(`OpenRouter request: model=${model}, messages=${messages.length}, tools=${hasTools ? enabledTools.length : 0}`, "openrouter");

  const allToolCalls: Array<{ name: string; args: any; result: string }> = [];
  let totalTokens = 0;
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

      const choice = response.choices[0];
      if (!choice) break;

      const message = choice.message;

      if (message.tool_calls && message.tool_calls.length > 0) {
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

          const result = await executeToolCall(fnName, fnArgs);
          allToolCalls.push({ name: fnName, args: fnArgs, result: result.substring(0, 500) });

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

    log(`OpenRouter response: ${totalTokens} tokens, ${allToolCalls.length} tool calls`, "openrouter");

    return {
      content: finalContent,
      tokensUsed: totalTokens,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
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
