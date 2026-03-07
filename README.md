# Nami

Autonomous multi-agent orchestration system with heartbeat-driven execution, swarm workflows, and OpenRouter.ai BYOK inference.

## Features

- **Autonomous Operation** - Auto-boots on start with configurable heartbeat that continuously drives agent activity
- **Multi-Agent Hierarchy** - Nami (brain) -> Spawns (workers) -> Swarms (coordinated workflows) -> SwarmQueens (autonomous QA managers)
- **400+ AI Models** - OpenRouter.ai integration with BYOK (Bring Your Own Key) support
- **Swarm Workflows** - Create goal-driven agent swarms with autonomous queens that delegate, monitor, and review work
- **Scheduled Swarms** - Recurring execution patterns (interval, daily, weekly) with auto-sleep between runs
- **Engine Mind** - Self-healing tool execution, auto-compaction, and spawn validation via Pi framework
- **Workspace Tools** - File I/O, shell execution, web browsing, web search, Google Workspace
- **Usage Tracking** - Per-call token and cost tracking with breakdowns by source, model, and swarm
- **Documentation System** - Built-in docs that agents can read and write, editable from the UI
- **Real-time UI** - WebSocket-powered dark-themed interface with chat, activity feeds, and engine controls
- **Disk Persistence** - All data survives restarts via `.nami-data/` JSON storage

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
| `SESSION_SECRET` | No | Session secret (auto-generated if not set) |
| `PORT` | No | Server port (default: 5000) |

You can also configure your API key through the Settings page in the UI (BYOK).

## Architecture

```
client/             React SPA (Vite + Shadcn UI + Tailwind)
  src/
    pages/          Chat, Spawns, Swarms, Tools, Usage, Docs, Settings...
    components/     Sidebar, UI components
    lib/            WebSocket client, query client, theme
server/
  index.ts          Express server entry point
  engine.ts         Core orchestration (heartbeat, agents, swarms, chat)
  openrouter.ts     OpenRouter.ai client with pricing cache
  tools.ts          Tool registry (file, shell, web, MCP, docs)
  storage.ts        In-memory storage with JSON disk persistence
  engine-mind.ts    Pi framework integration (self-healing, compaction)
  routes.ts         REST API + WebSocket setup
shared/
  schema.ts         TypeScript types and Zod schemas
.nami-data/         Runtime data (auto-created, gitignored)
```

## Agent Hierarchy

1. **Nami** - Main orchestrator brain. Manages all spawns and swarms. Accessible via chat.
2. **Spawn** - Worker agents created by Nami for specific tasks.
3. **Swarm** - Goal-driven group of agents. A swarm IS the workflow.
4. **SwarmQueen** - Autonomous QA manager per swarm. Creates spawns, delegates tasks, reviews results. Cannot have its primary objective changed.

## Available Tools

Nami has access to these tools (toggleable in the Tools page):

| Tool | Description |
|------|-------------|
| `file_read` | Read files from workspace |
| `file_write` | Write/create files in workspace |
| `file_list` | List directory contents |
| `shell_exec` | Execute shell commands |
| `self_inspect` | Inspect Nami's own state |
| `web_browse` | Browse web pages (headless Chromium) |
| `web_search` | Real-time web search via Perplexity |
| `google_workspace` | Gmail, Calendar, Drive, Sheets, Docs |
| `create_swarm` | Create new swarms with queens |
| `manage_swarm` | Pause, resume, cancel swarms |
| `pin_chat` | Pin important conversations |
| `docs_read` | Read documentation pages |
| `docs_write` | Create or update documentation |

## API Reference

### Chat
- `GET /api/chat` - Chat history
- `POST /api/chat` - Send message to Nami

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:id/messages` - Agent message history

### Swarms
- `GET /api/swarms` - List all swarms
- `POST /api/swarms` - Create swarm
- `GET /api/swarms/:id` - Swarm details
- `POST /api/swarms/:id/run` - Execute swarm
- `PATCH /api/swarms/:id/schedule` - Set schedule

### Engine
- `POST /api/engine/start` - Start engine
- `POST /api/engine/pause` - Pause engine
- `POST /api/engine/stop` - Stop engine
- `GET /api/engine/status` - Engine status

### Documentation
- `GET /api/docs` - List all doc pages
- `GET /api/docs/:slug` - Get doc page by slug
- `POST /api/docs` - Create doc page
- `PUT /api/docs/:slug` - Update doc page
- `DELETE /api/docs/:slug` - Delete doc page

### Other
- `GET /api/usage/summary` - Usage statistics
- `GET /api/tools` - List tools
- `GET /api/config` - System configuration

## Production Build

```bash
npm run build
npm start
```

This builds the React client and bundles the server for production deployment.

## Data Storage

All runtime data is stored in `.nami-data/` as JSON files. This directory is auto-created on first run and gitignored. To reset, simply delete the directory.

## License

MIT
