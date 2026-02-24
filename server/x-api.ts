import * as crypto from "crypto";
import * as https from "https";

const X_API_URL = "https://api.x.com/2/tweets";

function getCredentials() {
  return {
    apiKey: process.env.X_API_KEY || "",
    apiSecret: process.env.X_API_SECRET || "",
    accessToken: process.env.X_ACCESS_TOKEN || "",
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || "",
  };
}

export function hasXCredentials(): boolean {
  const creds = getCredentials();
  return !!(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessTokenSecret);
}

export function getMissingCredentials(): string[] {
  const missing: string[] = [];
  const creds = getCredentials();
  if (!creds.apiKey) missing.push("X_API_KEY");
  if (!creds.apiSecret) missing.push("X_API_SECRET");
  if (!creds.accessToken) missing.push("X_ACCESS_TOKEN");
  if (!creds.accessTokenSecret) missing.push("X_ACCESS_TOKEN_SECRET");
  return missing;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function generateOAuthHeader(method: string, url: string): string {
  const creds = getCredentials();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(method, url, oauthParams, creds.apiSecret, creds.accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

export interface PostResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

export async function postToX(text: string): Promise<PostResult> {
  if (!hasXCredentials()) {
    const missing = getMissingCredentials();
    return { success: false, error: `Missing credentials: ${missing.join(", ")}` };
  }

  if (text.length > 280) {
    return { success: false, error: `Tweet too long: ${text.length}/280 characters` };
  }

  if (!text.trim()) {
    return { success: false, error: "Tweet text cannot be empty" };
  }

  const authHeader = generateOAuthHeader("POST", X_API_URL);
  const body = JSON.stringify({ text });

  return new Promise((resolve) => {
    const urlObj = new URL(X_API_URL);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 201 && json.data?.id) {
              resolve({ success: true, tweetId: json.data.id });
            } else {
              const errMsg = json.detail || json.errors?.[0]?.message || json.title || `HTTP ${res.statusCode}`;
              resolve({ success: false, error: errMsg });
            }
          } catch {
            resolve({ success: false, error: `Invalid response (HTTP ${res.statusCode}): ${data.substring(0, 200)}` });
          }
        });
      }
    );

    req.on("error", (err) => {
      resolve({ success: false, error: `Request failed: ${err.message}` });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ success: false, error: "Request timed out (15s)" });
    });

    req.write(body);
    req.end();
  });
}

export async function deleteFromX(tweetId: string): Promise<PostResult> {
  if (!hasXCredentials()) {
    return { success: false, error: `Missing credentials: ${getMissingCredentials().join(", ")}` };
  }

  const deleteUrl = `${X_API_URL}/${tweetId}`;
  const authHeader = generateOAuthHeader("DELETE", deleteUrl);

  return new Promise((resolve) => {
    const urlObj = new URL(deleteUrl);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "DELETE",
        headers: {
          Authorization: authHeader,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 && json.data?.deleted) {
              resolve({ success: true, tweetId });
            } else {
              resolve({ success: false, error: json.detail || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: false, error: `Invalid response (HTTP ${res.statusCode})` });
          }
        });
      }
    );

    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ success: false, error: "Request timed out" });
    });
    req.end();
  });
}

export function getXStatus(): {
  configured: boolean;
  missing: string[];
} {
  return {
    configured: hasXCredentials(),
    missing: getMissingCredentials(),
  };
}
