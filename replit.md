# Nami - Agentic Workflow Orchestrator

## Overview
Nami is an enterprise-grade multi-agent orchestration system for AgentNami.com. It manages hierarchical agent structures (Nami -> Spawns -> Swarms -> SwarmQueens) with OpenRouter.ai BYOK integration for multi-model inference across 400+ AI models. Features an autonomous heartbeat system inspired by OpenClaw for continuous agent monitoring.

## Architecture
- **Frontend**: React SPA with Shadcn UI, Tailwind CSS, dark green-tinted theme, WebSocket real-time updates
- **Backend**: Express.js + TypeScript with in-memory storage (MVP), OpenRouter client, EventBus
- **Inference**: OpenRouter.ai API (OpenAI SDK configured with custom base URL) - BYOK support
- **Communication**: WebSocket for real-time events, REST API for CRUD
- **Heartbeat**: Interval-based autonomous agent loop (like OpenClaw) - pings Nami with configurable instructions

## Agent Hierarchy
1. **Nami** - Main brain, creates and manages all spawns and swarms
2. **Spawn** - Child agents created by Nami, perform specific tasks
3. **Swarm** - Group of agents coordinated toward a single goal/objective (swarm = workflow)
4. **SwarmQueen** - Autonomous QA manager per swarm, cannot have its primary objective changed by Nami

## Key Concepts
- **Swarm = Workflow**: A swarm IS the workflow. Steps are embedded in the swarm as either prompt-based or code-based instructions.
- **Chat Module**: Direct conversational interface with Nami, the primary orchestrator. Main view of the app.
- **Heartbeat**: Configurable autonomous loop that periodically pings Nami with instructions. Reports < SLEEP > when idle.
- **Engine Mind**: Thoughts (internal reasoning), Memory (stored context), Heartbeat config, Pi Session (self-healing, spawn validation, auto-compaction)
- **Engine State**: RUNNING / PAUSED / STOPPED with Pause/Stop controls in sidebar

## Key Files
- `shared/schema.ts` - All TypeScript types and Zod schemas (including Thought, Memory, HeartbeatConfig, EngineState)
- `server/engine.ts` - Core orchestration engine (EventBus, heartbeat loop, agent/swarm management, chat with Nami)
- `server/openrouter.ts` - OpenRouter.ai BYOK client
- `server/engine-mind.ts` - Pi framework Engine Mind wrapper (self-healing, spawn validation, auto-compaction, diagnostics)
- `server/tools.ts` - Tool registry (file_read, file_write, file_list, shell_exec, self_inspect, web_browse, web_search, google_workspace, ennube_mcp, create_swarm, manage_swarm) with permissions
- `server/routes.ts` - Express API routes + WebSocket setup
- `server/storage.ts` - In-memory storage layer with file-based config persistence
- `client/src/App.tsx` - Main app with sidebar layout, chat as default view
- `client/src/pages/` - Chat, Thoughts, Memory, Heartbeat, Skills, Spawns, Swarms, Tools, Activity, Settings
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with engine controls
- `client/src/lib/websocket.ts` - WebSocket client for real-time events

## API Routes
- `GET/POST /api/chat` - Chat with Nami orchestrator
- `GET/POST /api/agents` - CRUD for spawn agents
- `GET/POST /api/swarms` - CRUD for swarms (with embedded workflow steps)
- `POST /api/swarms/:id/run` - Execute swarm workflow steps
- `GET/POST/DELETE /api/thoughts` - Nami's internal reasoning log
- `GET/POST/DELETE /api/memories` - Stored context and knowledge
- `GET/PUT /api/skills/file` - Skills.md single-file read/write
- `GET/POST/PUT/DELETE /api/docs` - Documentation pages (agent-writable knowledge base)
- `GET/PUT /api/heartbeat` - Heartbeat configuration
- `POST /api/engine/start|pause|stop` - Engine state control
- `GET /api/engine/status` - Engine status (state, heartbeat count, model)
- `GET /api/stats` - System statistics
- `GET /api/events` - Activity log
- `GET/PUT /api/config` - System configuration (BYOK API key)
- `GET /api/tools` - List available tools with status
- `PUT /api/tools/:name/toggle` - Enable/disable individual tools
- `GET/PUT /api/tools/permissions` - Tool permission configuration
- `GET /api/engine-mind/status` - Engine Mind session status and stats
- `POST /api/engine-mind/initialize` - Initialize Pi session
- `POST /api/engine-mind/shutdown` - Shutdown Pi session
- `POST /api/engine-mind/reinitialize` - Reinitialize Pi session
- `POST /api/engine-mind/diagnostic` - Run Engine Mind diagnostic
- `POST /api/engine-mind/compact` - Trigger chat history compaction
- `GET /api/x/status` - X (Twitter) credential status
- `POST /api/x/test` - Send test tweet
- `POST /api/x/post` - Post tweet with custom text
- `POST /api/x/delete` - Delete tweet by ID

## Recent Changes
- 2026-02-24: X (Twitter) integration: server/x-api.ts OAuth 1.0a engine (post, delete tweets), 3 agent tools (x_post_tweet, x_delete_tweet, x_get_status) in "social" category, API routes (/api/x/status, test, post, delete), Settings UI card with credential status, test tweet, quick post. No external Twitter libs - built from Node crypto/https. Requires X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET secrets.
- 2026-02-20: Documentation system: DocPage schema (slug, title, content, lastEditedBy), docs_read/docs_write agent tools, Docs page UI with markdown rendering, CRUD API routes (/api/docs), disk persistence, sidebar nav entry. README.md added for repo sharing.
- 2026-02-20: Repo cleanup for shareability: removed 19 unused deps (drizzle, passport, pg, etc.), dead files (drizzle.config.ts, dashboard.tsx), cleaned build script, updated .gitignore, added .env.example, updated package.json metadata.
- 2026-02-20: Usage tracking system: UsageRecord schema with per-call prompt/completion tokens, model, cost, source (heartbeat/chat/agent/swarm). OpenRouter pricing cache with 6h TTL. recordUsage wired at all 5 chatCompletion call sites. Usage page UI with summary cards + by-source/model/swarm breakdown tabs. API routes: GET /api/usage, GET /api/usage/summary, DELETE /api/usage. Sidebar entry added.
- 2026-02-22: Engine Mind (Pi) self-healing wired into ALL tool execution: openrouter.ts routes tool calls through executeWithHealing when Engine Mind is initialized, covers chat, heartbeat, SwarmQueen, and spawn agents
- 2026-02-22: SwarmQueens and spawns now have full tool access (useTools: true, maxToolRounds: 3) - can use web_search, web_browse, file_read/write, shell_exec, google_workspace, ennube_mcp, docs_read/write
- 2026-02-22: Chromium web_browse fixed for containerized environments: added --disable-setuid-sandbox, --disable-dev-shm-usage, --single-process, --no-zygote flags
- 2026-02-22: Fixed EngineMindStatus schema errors field type mismatch (z.string[] -> z.object[])
- 2026-02-22: Full mobile responsiveness across all pages (responsive padding, flex-wrap, dialog constraints, mobile header with sidebar trigger)
- 2026-02-20: Scheduled swarms feature: SwarmSchedule schema (interval/daily/weekly), "sleeping" status, schedule checker in engine heartbeat (30s), auto completion→sleeping transition, PATCH /api/swarms/:id/schedule route, UI with Scheduled filter tab, schedule controls in create dialog, schedule display on swarm cards and detail page
- 2026-02-20: Full disk persistence for agents, swarms, events, and agent messages (.nami-data/) - all survive server restarts
- 2026-02-20: Swarm detail page (/swarms/:id) with group-chat-style activity feed showing queen thinking, spawn creation, spawn results, reviews, errors, completion messages. SwarmMessage schema + storage + API route. Swarm cards now clickable with View button.
- 2026-02-20: Engine Mind (Pi framework) integration: server/engine-mind.ts with self-healing executeWithHealing, spawn validation, auto-compaction (40+ msg threshold), diagnostics, Pi Session monitoring page, Engine Mind settings (enable/disable, model selector), API routes (/api/engine-mind/status, initialize, shutdown, reinitialize, diagnostic, compact)
- 2026-02-23: Settings persistence via PostgreSQL: config, heartbeat, and engine state now saved to nami_settings DB table (survives republishes). API key excluded from DB storage (uses env var only). Default engine state changed to "stopped" so fresh deploys don't auto-start. DB is authoritative for settings; file-based persistence remains as local cache.
- 2026-02-23: Chat persistence fix: heartbeat and swarm queen autonomous messages no longer flood main chat history. Heartbeat responses stay in heartbeat logs only. SwarmQueen status/completion messages stay in swarm messages only. Chat cap raised to 500 with smart user-message-preserving trim. WebSocket reconnect now invalidates all queries to refresh UI after server restarts. Active swarms marked as failed and running agents reset to idle on boot.
- 2026-02-22: File viewer page: browse workspace files created by agents/swarms, view contents with syntax-highlighted preview, copy content, delete files. API routes: GET /api/files (list dir), GET /api/files/read (read file), DELETE /api/files (delete). Blocked system dirs (node_modules, .git, etc). Sidebar nav entry added.
- 2026-02-22: Removed pinned chat feature (pin_chat tool, PinnedChat schema, sidebar display, API routes, disk persistence)
- 2026-02-20: Added web_search tool (Perplexity via OpenRouter) for real-time web search capability
- 2026-02-20: Swarms page filter toggle: Active / Completed / Cancelled & Failed tabs with count badges
- 2026-02-20: Added create_swarm and manage_swarm tools for Nami's LLM function calling
- 2026-02-20: SwarmQueen autonomous loop: queen creates spawns, delegates tasks, monitors, reviews, and completes objectives independently
- 2026-02-20: SwarmQueen is semi-independent (immutable primary objective), hyper-focused, defaults to spawning agents for work
- 2026-02-20: Fixed Ennube MCP tools/list truncation - now shows all 7 tools with concise summary format
- 2026-02-20: Added Skills page under Engine Mind (markdown skill documents with CRUD + persistence)
- 2026-02-20: Added web_browse (Chromium), google_workspace (gogCLI), ennube_mcp (Ennube AI MCP) tools
- 2026-02-20: Chat history, thoughts, memories now persist to disk (.nami-data/) across restarts
- 2026-02-20: Heartbeat now always calls LLM; SLEEP no longer floods chat history
- 2026-02-20: Tool system: file_read, file_write, file_list, shell_exec, self_inspect tools for Nami workspace access
- 2026-02-20: OpenRouter function calling integration for tool use in chat and heartbeat
- 2026-02-20: Safety/permission layer for tool execution with blocked paths and configurable access
- 2026-02-20: Settings and config persistence to disk (.nami-data/) surviving server restarts
- 2026-02-19: Engine auto-boots on server start (always-on autonomous mode). Heartbeat defaults to enabled.
- 2026-02-19: Heartbeat uses setTimeout-based scheduling with exponential backoff on errors (never crashes)
- 2026-02-19: Multi-attempt heartbeat efforts (up to 3 LLM cycles per beat) with summary generation
- 2026-02-19: Collapsible heartbeat timeline panel on right side of chat view
- 2026-02-19: HeartbeatLog storage and API endpoint for tracking beat history
- 2026-02-19: Major UI overhaul to match OpenClaw-style interface with dark green theme
- 2026-02-19: Added heartbeat system (autonomous agent loop), thoughts, memory, engine state
- 2026-02-19: Chat is now the main view (removed Dashboard as default)
- 2026-02-19: Sidebar redesigned with Chats section, Engine Mind section, engine controls
- 2026-02-19: Restructured architecture - merged workflow into swarm (swarm = workflow)

## Environment
- `OPENROUTER_API_KEY` - OpenRouter.ai API key (also configurable via Settings UI for BYOK)
- `SESSION_SECRET` - Session secret
- `ENNUBE_MCP_APIKEY` - Ennube AI MCP server API key

## External Tools
- **Chromium** - Headless browser for web_browse tool (installed via Nix)
- **gogCLI v0.11.0** - Google Workspace CLI at `.local/bin/gog` (Gmail, Calendar, Drive, Sheets, Docs)
- **Ennube MCP** - Remote MCP server at `https://dev.ennube.ai/api/tools/mcp`

## User Preferences
- Node.js/TypeScript only (CTO requirement for desktop app compatibility)
- OpenRouter.ai for inference (not OpenAI directly)
- BYOK (Bring Your Own Key) support for future .exe packaging
- Enterprise-focused, Windows-compatible design
- Swarm = Workflow (no separate workflow concept)
- OpenClaw-style heartbeat for autonomous agent operation
- Dark green-tinted UI theme
- Chat as primary interface, not dashboard
