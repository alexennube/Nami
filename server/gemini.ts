import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";
import fs from "fs";
import path from "path";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_FILE = path.join(process.cwd(), ".nami-data", "google-token.json");

const GEMINI_SCOPES = "https://www.googleapis.com/auth/cloud-platform";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function isValidRefreshToken(token: string | undefined): boolean {
  return !!token && token.length > 5 && token !== "NA" && token !== "na" && token !== "placeholder";
}

function getRefreshToken(): string | undefined {
  const envToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (isValidRefreshToken(envToken)) return envToken;

  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
      if (isValidRefreshToken(data.refresh_token)) return data.refresh_token;
    }
  } catch {}

  return undefined;
}

export function saveRefreshToken(token: string): void {
  process.env.GOOGLE_REFRESH_TOKEN = token;
  cachedAccessToken = null;
  tokenExpiresAt = 0;

  try {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token, updated_at: new Date().toISOString() }));
    log("Saved Google refresh token to disk", "gemini");
  } catch (err: any) {
    log(`Failed to save refresh token to disk: ${err.message}`, "gemini");
  }
}

export function hasValidGeminiCredentials(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!getRefreshToken()) missing.push("GOOGLE_REFRESH_TOKEN (not authenticated)");
  return { valid: missing.length === 0, missing };
}

export async function getGeminiAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = getRefreshToken();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as environment secrets.");
  }

  if (!refreshToken) {
    throw new Error("Google not authenticated. Go to Settings and click 'Authenticate with Google' to complete the OAuth flow.");
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

export function getGoogleAuthUrl(redirectUri: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GEMINI_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${errText}`);
  }

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };

  if (!data.refresh_token) {
    throw new Error("No refresh token received. Make sure to revoke previous access at https://myaccount.google.com/permissions and try again.");
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);

  return { access_token: data.access_token, refresh_token: data.refresh_token };
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
    const creds = hasValidGeminiCredentials();
    if (!creds.valid) {
      return { success: false, message: `Missing: ${creds.missing.join(", ")}` };
    }

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
