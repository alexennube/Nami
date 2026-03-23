# Nami

Autonomous multi-agent orchestration system with heartbeat-driven execution, swarm workflows, and multi-provider AI inference.

## Features

- **Autonomous Operation** — Auto-boots on start with a configurable heartbeat that continuously drives agent activity
- **Multi-Agent Hierarchy** — Nami (brain) → Spawns (workers) → Swarms (coordinated workflows) → SwarmQueens (autonomous QA managers)
- **Multi-Provider Inference** — OpenRouter.ai (400+ cloud models), Google Gemini (OAuth2), and LM Studio (local/private models)
- **Swarm Workflows** — Create goal-driven agent swarms with autonomous queens that delegate, monitor, and review work
- **Scheduled Swarms** — Recurring execution patterns (interval, daily, weekly) with auto-sleep between runs
- **Engine Mind** — Self-healing tool execution, auto-compaction, and spawn validation via Pi framework
- **Chat Sessions** — Multi-session conversational interface with real-time streaming, tool progress indicators, and chain-of-thought display
- **CRM** — Accounts, contacts, and multi-channel sales engagement sequences with drag-and-drop step builder, contact intelligence reports, and per-contact enrollment status
- **Kanban Board** — Drag-and-drop project management with columns, cards (priority, status, labels), and a comments/discussion section accessible by both users and agents
- **Audit Trail** — Comprehensive logging of all CRUD operations across agents, swarms, CRM, kanban, docs, memories, and config with CSV export
- **Browser Extension (Namiextend)** — Password-protected WebSocket bridge to a Chrome extension; agents can click, type, scroll, navigate, and read page content in the user's browser
- **File Viewer/Editor** — Browse, view, edit, download, and delete workspace files from the UI
- **Integrations Page** — Manage external service accounts (Google OAuth2 with multi-account support)
- **Workspace Tools** — File I/O, shell execution, web browsing, web search, Google Workspace, X (Twitter) posting
- **Usage Tracking** — Per-call token and cost tracking with breakdowns by source, model, and swarm
- **Documentation System** — Built-in docs that agents can read and write, editable from the UI
- **Real-time UI** — WebSocket-powered dark-themed interface with chat, activity feeds, and engine controls
- **Dual Persistence** — Data is written to both disk (`.nami-data/` JSON) and PostgreSQL for resilience across restarts and deployments

---

## Installation (Docker — Recommended)

Docker keeps everything isolated so nothing is installed on your computer besides Docker itself. This is the safest and easiest way to run Nami.

### Prerequisites

1. **Install Docker Desktop**
   - **Windows:** Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) and run the installer. You may need to enable WSL 2 during setup — Docker will walk you through it.
   - **Mac:** Download from the same link above and drag it to your Applications folder.
   - **Linux:** Follow the instructions at [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) for your distribution.

2. **Verify Docker is running**
   Open a terminal (Command Prompt, PowerShell, or Terminal) and run:
   ```bash
   docker --version
   ```
   You should see something like `Docker version 24.x.x`. If you get an error, make sure Docker Desktop is open and running.

### Step-by-Step Setup

1. **Download the project**
   ```bash
   git clone <your-repo-url>
   cd nami
   ```

2. **Create your configuration file**
   ```bash
   cp .env.example .env
   ```

3. **Edit the `.env` file** with a text editor and fill in your values:
   - `NAMI_USERNAME` and `NAMI_PASSWORD` — These are your login credentials for the Nami web interface (pick any username and password you want).
   - `OPENROUTER_API_KEY` — Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys). This gives you access to 400+ AI models. *Or skip this and use LM Studio for fully local/private inference (see below).*

4. **Start Nami**
   ```bash
   docker compose up -d
   ```
   The first time you run this, Docker will download everything it needs and build the app. This takes a few minutes. After that, it starts in seconds.

5. **Open Nami in your browser**
   Go to [http://localhost:5000](http://localhost:5000) and log in with the username and password you set in step 3.

### Useful Commands

| Command | What it does |
|---------|-------------|
| `docker compose up -d` | Start Nami in the background |
| `docker compose down` | Stop Nami |
| `docker compose logs -f nami` | Watch live logs |
| `docker compose up -d --build` | Rebuild after pulling updates |
| `docker compose down -v` | Stop and delete all data (fresh start) |

### Updating

When a new version is available:
```bash
git pull
docker compose up -d --build
```

---

## Using LM Studio (Local AI Models)

LM Studio lets you run AI models entirely on your own computer — no API keys needed, fully private, no data leaves your machine.

### Setup

1. **Download LM Studio** from [lmstudio.ai](https://lmstudio.ai/) and install it.

2. **Download a model** — Open LM Studio, go to the search tab, and download a model. Good starting choices:
   - `Qwen2.5-7B-Instruct` — Fast, good for general tasks
   - `Llama-3.1-8B-Instruct` — Well-rounded
   - `Mistral-7B-Instruct` — Lightweight and capable

3. **Start the local server** — In LM Studio, go to the "Local Server" tab (left sidebar), load your model, and click "Start Server". It will run on `http://localhost:1234`.

4. **Configure Nami to use LM Studio**
   - **If running with Docker:** In your `.env` file, set:
     ```
     LM_STUDIO_BASE_URL=http://host.docker.internal:1234/v1
     ```
     Then restart: `docker compose up -d --build`
   - **If running directly:** The default URL `http://localhost:1234/v1` will work automatically.

5. **Switch the provider in Settings** — In Nami's web UI, go to Settings and switch the provider toggle from "OpenRouter" to "LM Studio". Your loaded model will appear in the model dropdown.

> **Note:** LM Studio must be open and the server running whenever you use Nami with local inference. If LM Studio is closed, Nami won't be able to reach it.

---

## Manual Installation (Without Docker)

If you prefer not to use Docker, you can run Nami directly. You'll need Node.js 20+ and PostgreSQL installed on your machine.

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [PostgreSQL 14+](https://www.postgresql.org/download/)

### Setup

```bash
git clone <your-repo-url>
cd nami
npm install
cp .env.example .env
```

Edit `.env` and set at minimum:
- `NAMI_USERNAME` and `NAMI_PASSWORD`
- `OPENROUTER_API_KEY` (or use LM Studio)
- `DATABASE_URL` — Your PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/nami`

### Run in Development

```bash
npm run dev
```

### Run in Production

```bash
npm run build
npm start
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NAMI_USERNAME` | Yes | Login username for the web UI |
| `NAMI_PASSWORD` | Yes | Login password for the web UI |
| `OPENROUTER_API_KEY` | No* | OpenRouter.ai API key ([get one](https://openrouter.ai/keys)) |
| `LM_STUDIO_BASE_URL` | No | LM Studio server URL (default: `http://localhost:1234/v1`) |
| `DATABASE_URL` | Yes** | PostgreSQL connection string |
| `PORT` | No | Server port (default: 5000) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth2 client ID (for Gemini + Workspace) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth2 client secret |
| `PERPLEXITY_API_KEY` | No | Perplexity API key for `web_search` tool |
| `X_API_KEY` | No | X (Twitter) API key |
| `X_API_SECRET` | No | X (Twitter) API secret |
| `X_ACCESS_TOKEN` | No | X (Twitter) access token |
| `X_ACCESS_TOKEN_SECRET` | No | X (Twitter) access token secret |

\* At least one inference provider is required (OpenRouter API key, Google Gemini OAuth, or LM Studio running locally).
\** Auto-configured when using Docker Compose.

You can also configure API keys and providers through the Settings page in the web UI.

---

## Architecture

```
client/                  React SPA (Vite + Shadcn UI + Tailwind)
  src/
    pages/               Chat, Spawns, Swarms, CRM, Kanban, Files,
                         Integrations, Settings, Usage, Docs, Engine Mind,
                         Heartbeat, Thoughts, Memory, Skills, Activity...
    components/          Sidebar, configurable table, status badge, theme toggle, UI kit
    lib/                 WebSocket client, query client, theme provider, utils
server/
  index.ts               Express server entry point
  engine.ts              Core orchestration (heartbeat, agents, swarms, chat)
  openrouter.ts          Multi-provider inference client (OpenRouter, Gemini, LM Studio)
  gemini.ts              Google Gemini inference client
  tools.ts               Tool registry (file, shell, web, CRM, kanban, browser, X, MCP, docs)
  storage.ts             In-memory storage with JSON disk persistence
  db-persist.ts          PostgreSQL persistence layer
  engine-mind.ts         Pi framework integration (self-healing, compaction)
  audit.ts               Audit trail logging
  namiextend.ts          Browser extension WebSocket bridge
  routes.ts              REST API + WebSocket setup
  x-api.ts               X (Twitter) API client
  toolExecutionGuard.ts  Tool execution safety layer
  toolValidation.ts      Tool input validation
  static.ts              Static file serving
  vite.ts                Vite dev server integration
shared/
  schema.ts              TypeScript types and Zod schemas
.nami-data/              Runtime data (auto-created, gitignored)
```

## Agent Hierarchy

1. **Nami** — Main orchestrator brain. Manages all spawns and swarms. Accessible via chat.
2. **Spawn** — Worker agents created by Nami for specific tasks.
3. **Swarm** — Goal-driven group of agents. A swarm IS the workflow.
4. **SwarmQueen** — Autonomous QA manager per swarm. Creates spawns, delegates tasks, reviews results. Cannot have its primary objective changed.

## Data Storage

Runtime data is persisted in two ways:

1. **Disk** — `.nami-data/` directory with JSON files (auto-created, gitignored)
2. **PostgreSQL** — All critical data (agents, swarms, chat, CRM, kanban, audit log, config, workspace files) is also written to Postgres

On startup, data loads from PostgreSQL first with automatic one-time migration from disk files. To reset, delete `.nami-data/` and clear the database tables.

## License

MIT
