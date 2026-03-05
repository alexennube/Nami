import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import { randomBytes, createHash } from "crypto";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

export const activeSessions = new Set<string>();

export function getActiveSessions() {
  return activeSessions;
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

app.post("/api/auth/login", (req: Request, res: Response) => {
  const { username, password } = req.body;
  const validUser = process.env.NAMI_USERNAME;
  const validPass = process.env.NAMI_PASSWORD;

  if (!validUser || !validPass) {
    return res.status(500).json({ message: "Authentication not configured" });
  }

  if (username === validUser && password === validPass) {
    const token = generateToken();
    const hashed = hashToken(token);
    activeSessions.add(hashed);
    res.cookie("nami_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  return res.status(401).json({ message: "Invalid credentials" });
});

app.post("/api/auth/logout", (_req: Request, res: Response) => {
  const token = _req.cookies?.nami_session;
  if (token) {
    activeSessions.delete(hashToken(token));
  }
  res.clearCookie("nami_session");
  return res.json({ ok: true });
});

app.get("/api/auth/check", (req: Request, res: Response) => {
  const token = req.cookies?.nami_session;
  if (token && activeSessions.has(hashToken(token))) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

export { hashToken };

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/auth/")) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    const token = req.cookies?.nami_session;
    if (!token || !activeSessions.has(hashToken(token))) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);

      try {
        const engine = await import("./engine");
        const { registerEngine } = await import("./tools");
        const { storage: storageInstance } = await import("./storage");
        await storageInstance.initFromDb();

        const config = await storageInstance.getConfig();
        const apiKeySource = (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 10) ? "env" : "config";
        log(`[BOOT] API key source: ${apiKeySource} | Model: ${config.defaultModel} | Provider: ${config.namiProvider || "openrouter"}`);
        registerEngine({
          createSwarmWithQueen: engine.createSwarmWithQueen,
          createSpawn: engine.createSpawn,
          swarmAction: engine.swarmAction,
          runSwarmQueen: engine.runSwarmQueen,
          getSwarmStatus: engine.getSwarmStatus,
          getSwarm: (swarmId: string) => storageInstance.getSwarm(swarmId),
        });
        await engine.bootEngine();

        import("./gemini").then(({ preloadRefreshToken, syncGogCLIOnBoot }) => {
          preloadRefreshToken().then(() => syncGogCLIOnBoot()).catch(() => {});
        });
      } catch (err: any) {
        log(`Engine auto-boot failed (non-fatal): ${err.message}`, "engine");
      }
    },
  );
})();
