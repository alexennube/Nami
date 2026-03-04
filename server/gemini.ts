import OpenAI from "openai";
import { storage } from "./storage";
import { log } from "./index";
import { dbGet, dbSet, getDefaultGoogleAccount, getGoogleAccounts, upsertGoogleAccount } from "./db-persist";
import fs from "fs";
import path from "path";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_FILE = path.join(process.cwd(), ".nami-data", "google-token.json");

const GEMINI_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
  "https://www.googleapis.com/auth/script.processes",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/tasks",
  "profile",
  "email",
].join(" ");

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function isValidRefreshToken(token: string | undefined): boolean {
  return !!token && token.length > 5 && token !== "NA" && token !== "na" && token !== "placeholder";
}

function getRefreshTokenSync(): string | undefined {
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

async function getRefreshToken(): Promise<string | undefined> {
  try {
    const defaultAccount = await getDefaultGoogleAccount();
    if (defaultAccount && isValidRefreshToken(defaultAccount.refresh_token)) {
      process.env.GOOGLE_REFRESH_TOKEN = defaultAccount.refresh_token;
      return defaultAccount.refresh_token;
    }
  } catch {}

  const syncToken = getRefreshTokenSync();
  if (syncToken) return syncToken;

  try {
    const dbToken = await dbGet<string>("google_refresh_token");
    if (isValidRefreshToken(dbToken ?? undefined)) {
      process.env.GOOGLE_REFRESH_TOKEN = dbToken!;
      log("Loaded Google refresh token from database (legacy)", "gemini");
      return dbToken!;
    }
  } catch {}

  return undefined;
}

export async function saveRefreshToken(token: string): Promise<{ diskOk: boolean; dbOk: boolean }> {
  process.env.GOOGLE_REFRESH_TOKEN = token;
  cachedAccessToken = null;
  tokenExpiresAt = 0;

  let diskOk = false;
  let dbOk = false;

  try {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token, updated_at: new Date().toISOString() }));
    log("Saved Google refresh token to disk", "gemini");
    diskOk = true;
  } catch (err: any) {
    log(`Failed to save refresh token to disk: ${err.message}`, "gemini");
  }

  try {
    await dbSet("google_refresh_token", token);
    log("Saved Google refresh token to database", "gemini");
    dbOk = true;
  } catch (err: any) {
    log(`Failed to save refresh token to database: ${err.message}`, "gemini");
  }

  return { diskOk, dbOk };
}

export async function hasValidGeminiCredentials(): Promise<{ valid: boolean; missing: string[] }> {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!(await getRefreshToken())) missing.push("GOOGLE_REFRESH_TOKEN (not authenticated)");
  return { valid: missing.length === 0, missing };
}

export async function getGeminiAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = await getRefreshToken();

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

const FALLBACK_GEMINI_MODELS: GeminiModel[] = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", context_length: 2097152, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
  { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B", context_length: 1048576, pricing: { prompt: "0", completion: "0" } },
];

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
      const errBody = await res.text().catch(() => "");
      log(`Gemini models API returned ${res.status}: ${errBody.slice(0, 200)}`, "gemini");
      log("Using fallback Gemini model list. To enable dynamic listing, enable the 'Generative Language API' in Google Cloud Console.", "gemini");
      geminiModelsCache = FALLBACK_GEMINI_MODELS;
      geminiModelsCacheTime = Date.now();
      return FALLBACK_GEMINI_MODELS;
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
    log(`Fetched ${models.length} Gemini models from API`, "gemini");
    return models;
  } catch (err: any) {
    log(`Failed to fetch Gemini models: ${err.message}. Using fallback list.`, "gemini");
    if (geminiModelsCache.length > 0) return geminiModelsCache;
    geminiModelsCache = FALLBACK_GEMINI_MODELS;
    geminiModelsCacheTime = Date.now();
    return FALLBACK_GEMINI_MODELS;
  }
}

export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const info = await getGoogleUserInfo(accessToken);
    return info?.email || null;
  } catch {
    return null;
  }
}

export async function getGoogleUserInfo(accessToken: string): Promise<{ email: string; name?: string; picture?: string } | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { email?: string; name?: string; picture?: string };
    if (!data.email) return null;
    return { email: data.email, name: data.name, picture: data.picture };
  } catch {
    return null;
  }
}

export async function getAccessTokenForRefreshToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

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
    throw new Error(`Failed to refresh access token: ${res.status} ${errText}`);
  }

  return await res.json() as { access_token: string; expires_in: number };
}

export async function syncGogCLI(refreshToken: string, accessToken: string): Promise<{ success: boolean; email?: string; error?: string }> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  const GOG_CLI_PATH = path.join(process.cwd(), ".local", "bin", "gog");
  const GOG_KEYRING_PASSWORD = "nami-keyring";
  const env = { ...process.env, GOG_KEYRING_PASSWORD };

  try {
    const email = await getGoogleUserEmail(accessToken);
    if (!email) {
      return { success: false, error: "Could not determine Google account email" };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { success: false, error: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set" };
    }

    const gogConfigDir = path.join(process.cwd(), ".config", "gogcli");
    if (!fs.existsSync(gogConfigDir)) fs.mkdirSync(gogConfigDir, { recursive: true });

    const configFile = path.join(gogConfigDir, "config.json");
    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(configFile, JSON.stringify({ keyring_backend: "file" }));
    } else {
      try {
        const existing = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        existing.keyring_backend = "file";
        fs.writeFileSync(configFile, JSON.stringify(existing));
      } catch {
        fs.writeFileSync(configFile, JSON.stringify({ keyring_backend: "file" }));
      }
    }

    const credsFile = path.join(gogConfigDir, "credentials.json");
    fs.writeFileSync(credsFile, JSON.stringify({ client_id: clientId, client_secret: clientSecret }));
    log(`Updated gogCLI credentials.json with Gemini OAuth client`, "gemini");

    const tokenFile = path.join(process.cwd(), ".nami-data", "gog-token-import.json");
    fs.writeFileSync(tokenFile, JSON.stringify({ email, refresh_token: refreshToken, client: "default" }));

    try {
      await execFileAsync(GOG_CLI_PATH, ["auth", "tokens", "import", tokenFile, "--no-input"], { env, timeout: 10000 });
      log(`Imported refresh token into gogCLI keyring for ${email}`, "gemini");
    } catch (importErr: any) {
      log(`gogCLI token import warning: ${importErr.message}`, "gemini");
    }

    try {
      fs.unlinkSync(tokenFile);
    } catch {}

    try {
      await execFileAsync(GOG_CLI_PATH, ["auth", "list", "--json"], { env, timeout: 5000 });
    } catch {}

    return { success: true, email };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getGogCLIStatus(): Promise<{ authenticated: boolean; accounts: string[] }> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  const GOG_CLI_PATH = path.join(process.cwd(), ".local", "bin", "gog");
  const GOG_KEYRING_PASSWORD = "nami-keyring";
  const env = { ...process.env, GOG_KEYRING_PASSWORD };

  try {
    const { stdout } = await execFileAsync(GOG_CLI_PATH, ["auth", "list", "--json"], { env, timeout: 5000 });
    const data = JSON.parse(stdout);
    const accounts: string[] = [];
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (entry.email) accounts.push(entry.email);
      }
    } else if (data.email) {
      accounts.push(data.email);
    }
    return { authenticated: accounts.length > 0, accounts };
  } catch {
    return { authenticated: false, accounts: [] };
  }
}

export async function syncGogCLIOnBoot(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return;

  try {
    const gogStatus = await getGogCLIStatus();
    if (gogStatus.authenticated) {
      log(`gogCLI already authenticated: ${gogStatus.accounts.join(", ")}`, "gemini");
      return;
    }

    const accessToken = await getGeminiAccessToken();
    const result = await syncGogCLI(refreshToken, accessToken);
    if (result.success) {
      log(`gogCLI synced on boot: ${result.email}`, "gemini");
    } else {
      log(`gogCLI boot sync skipped: ${result.error}`, "gemini");
    }
  } catch (err: any) {
    log(`gogCLI boot sync error: ${err.message}`, "gemini");
  }
}

export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const creds = await hasValidGeminiCredentials();
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
