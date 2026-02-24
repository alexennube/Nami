import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

export async function getGeminiAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google access token: ${res.status} ${errText}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  log(`Gemini access token refreshed, expires in ${data.expires_in}s`, "gemini");
  return cachedAccessToken;
}

export async function createGeminiClient(): Promise<OpenAI> {
  const accessToken = await getGeminiAccessToken();

  return new OpenAI({
    apiKey: accessToken,
    baseURL: GEMINI_BASE_URL,
  });
}

export interface GeminiModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

let geminiModelsCache: GeminiModel[] = [];
let geminiModelsCacheTime = 0;
const GEMINI_MODELS_TTL = 30 * 60 * 1000;

export async function fetchGeminiModels(): Promise<GeminiModel[]> {
  if (geminiModelsCache.length > 0 && Date.now() - geminiModelsCacheTime < GEMINI_MODELS_TTL) {
    return geminiModelsCache;
  }

  try {
    const accessToken = await getGeminiAccessToken();
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Gemini models API returned ${res.status}`);
    }

    const data = await res.json() as { models: any[] };
    const models: GeminiModel[] = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => ({
        id: m.name?.replace("models/", "") || m.name,
        name: m.displayName || m.name,
        context_length: m.inputTokenLimit || 0,
        pricing: { prompt: "0", completion: "0" },
      }));

    models.sort((a, b) => a.name.localeCompare(b.name));
    geminiModelsCache = models;
    geminiModelsCacheTime = Date.now();
    log(`Fetched ${models.length} Gemini models`, "gemini");
    return models;
  } catch (err: any) {
    log(`Failed to fetch Gemini models: ${err.message}`, "gemini");
    if (geminiModelsCache.length > 0) return geminiModelsCache;
    throw err;
  }
}

export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await createGeminiClient();
    const response = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Reply with exactly: NAMI_OK" }],
      max_tokens: 10,
    });

    const content = response.choices[0]?.message?.content || "";
    return { success: true, message: `Gemini connection successful. Response: ${content}` };
  } catch (error: any) {
    return { success: false, message: `Gemini connection failed: ${error.message}` };
  }
}
