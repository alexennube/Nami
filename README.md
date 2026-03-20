# Nami

Autonomous multi-agent orchestration system with heartbeat-driven execution, swarm workflows, and OpenRouter.ai BYOK inference.

## Features

- **Autonomous Operation** — Auto-boots on start with a configurable heartbeat that continuously drives agent activity
- **Multi-Agent Hierarchy** — Nami (brain) → Spawns (workers) → Swarms (coordinated workflows) → SwarmQueens (autonomous QA managers)
- **400+ AI Models** — OpenRouter.ai integration with BYOK (Bring Your Own Key) support, plus Google Gemini via OAuth2
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

## Quick Start

```bash
git clone <your-repo-url>
cd nami
npm install
cp .env.example .env
# Edit .env with your OpenRouter API key
npm run dev
```

Open `http://localhost:5000` in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter.ai API key ([get one here](https://openrouter.ai/keys)) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | No | Session secret (auto-generated if not set) |
| `PORT` | No | Server port (default: 5000) |
| `PERPLEXITY_API_KEY` | No | Perplexity API key for `web_search` tool |
| `X_API_KEY` | No | X (Twitter) API key for `x_post_tweet` / `x_delete_tweet` |
| `X_API_SECRET` | No | X (Twitter) API secret |
| `X_ACCESS_TOKEN` | No | X (Twitter) access token |
| `X_ACCESS_SECRET` | No | X (Twitter) access token secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth2 client ID (for Gemini + Workspace) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth2 client secret |
| `NAMIEXTEND_TOKEN` | No | Password for browser extension WebSocket auth |

You can also configure your OpenRouter API key through the Settings page in the UI (BYOK).

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
  openrouter.ts          OpenRouter.ai client with pricing cache
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

## Available Tools

Nami has access to these tools (toggleable in the Tools page):

| Tool | Description |
|------|-------------|
| `file_read` | Read files from workspace |
| `file_write` | Write/create files in workspace |
| `file_edit` | Edit existing files with find-and-replace |
| `file_search` | Search file contents by pattern |
| `file_list` | List directory contents |
| `shell_exec` | Execute shell commands |
| `self_inspect` | Inspect Nami's own state |
| `server_restart` | Restart the Nami server |
| `web_browse` | Browse web pages (headless Chromium) |
| `web_search` | Real-time web search via Perplexity |
| `google_workspace` | Gmail, Calendar, Drive, Sheets, Docs |
| `create_swarm` | Create new swarms with queens |
| `manage_swarm` | Pause, resume, cancel swarms |
| `docs_read` | Read documentation pages |
| `docs_write` | Create or update documentation |
| `x_post_tweet` | Post a tweet to X (Twitter) |
| `x_delete_tweet` | Delete a tweet from X |
| `x_get_status` | Check X API connection status |
| `browser_control` | Control the user's browser via Namiextend |
| `kanban` | Full CRUD on kanban columns, cards, and comments |
| `crm` | Manage CRM accounts, contacts, sequences, and activities |

## API Reference

### Chat
- `GET /api/chat` — Chat history (query `?sessionId=`)
- `POST /api/chat` — Send message to Nami
- `DELETE /api/chat` — Clear chat history
- `GET /api/chat/sessions` — List sessions
- `POST /api/chat/sessions` — Create session
- `PATCH /api/chat/sessions/:id` — Rename session
- `DELETE /api/chat/sessions/:id` — Delete session

### Agents
- `GET /api/agents` — List all agents
- `POST /api/agents` — Create agent
- `GET /api/agents/:id` — Agent details
- `POST /api/agents/:id/action` — Trigger agent action
- `POST /api/agents/:id/chat` — Chat with agent
- `DELETE /api/agents/:id` — Delete agent

### Swarms
- `GET /api/swarms` — List all swarms
- `POST /api/swarms` — Create swarm
- `GET /api/swarms/:id` — Swarm details
- `POST /api/swarms/:id/run` — Execute swarm
- `POST /api/swarms/:id/action` — Swarm action (pause/resume/cancel)
- `DELETE /api/swarms/:id` — Delete swarm

### Engine
- `POST /api/engine/start` — Start engine
- `POST /api/engine/pause` — Pause engine
- `POST /api/engine/stop` — Stop engine
- `GET /api/engine/status` — Engine status

### CRM
- `GET/POST /api/crm/accounts` — List / create accounts
- `GET/PATCH/DELETE /api/crm/accounts/:id` — Account CRUD
- `GET/POST /api/crm/contacts` — List / create contacts
- `GET/PATCH/DELETE /api/crm/contacts/:id` — Contact CRUD
- `POST /api/crm/contacts/:id/analyze` — Contact intelligence report
- `GET/POST /api/crm/sequences` — List / create sequences
- `GET/PATCH/DELETE /api/crm/sequences/:id` — Sequence CRUD
- `POST /api/crm/sequences/:id/enroll` — Enroll contact
- `POST /api/crm/sequences/:id/unenroll` — Unenroll contact
- `POST /api/crm/sequences/:id/pause-contact` — Pause contact
- `POST /api/crm/sequences/:id/resume-contact` — Resume contact
- `POST /api/crm/sequences/:id/advance-contact` — Advance contact to next step

### Kanban
- `GET /api/kanban` — Board state (columns + cards)
- `POST /api/kanban/columns` — Create column
- `PATCH /api/kanban/columns/:id` — Update column
- `DELETE /api/kanban/columns/:id` — Delete column
- `PUT /api/kanban/columns/reorder` — Reorder columns
- `POST /api/kanban/cards` — Create card
- `PATCH /api/kanban/cards/:id` — Update card
- `DELETE /api/kanban/cards/:id` — Delete card
- `PUT /api/kanban/cards/:id/move` — Move card between columns
- `GET /api/kanban/cards/:id/comments` — List comments
- `POST /api/kanban/cards/:id/comments` — Add comment

### Documentation
- `GET /api/docs` — List all doc pages
- `GET /api/docs/:slug` — Get doc page by slug
- `POST /api/docs` — Create doc page
- `PUT /api/docs/:slug` — Update doc page
- `DELETE /api/docs/:slug` — Delete doc page

### Audit Trail
- `GET /api/audit-log` — Paginated, filterable audit log
- `GET /api/audit-log/csv` — Full CSV export

### Other
- `GET /api/usage/summary` — Usage statistics
- `GET /api/tools` — List tools
- `GET /api/config` — System configuration
- `PUT /api/config` — Update configuration
- `GET /api/models` — OpenRouter model list
- `GET /api/models/gemini` — Gemini model list
- `GET /api/heartbeat` — Heartbeat config
- `GET /api/namiextend/status` — Browser extension status
- `GET /api/integrations/google/accounts` — Google accounts

## Production Build

```bash
npm run build
npm start
```

This builds the React client and bundles the server for production deployment.

## Data Storage

Runtime data is persisted in two ways:

1. **Disk** — `.nami-data/` directory with JSON files (auto-created, gitignored)
2. **PostgreSQL** — All critical data (agents, swarms, chat, CRM, kanban, audit log, config, workspace files) is also written to Postgres

On startup, data loads from PostgreSQL first with automatic one-time migration from disk files. To reset, delete `.nami-data/` and clear the database tables.

## License

MIT
