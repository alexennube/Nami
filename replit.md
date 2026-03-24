# Nami - Agentic Workflow Orchestrator

## Overview
Nami is an enterprise-grade multi-agent orchestration system for AgentNami.com. It manages hierarchical agent structures (Nami -> Spawns -> Swarms -> SwarmQueens) and integrates with OpenRouter.ai BYOK for multi-model inference. It features an autonomous heartbeat system for continuous agent monitoring, enabling sophisticated workflow automation and task delegation across various AI models. The project aims to provide a robust, scalable, and self-improving platform for agentic operations.

## User Preferences
- Node.js/TypeScript only ()
- OpenRouter.ai for inference (not OpenAI directly)
- BYOK (Bring Your Own Key) support for future .exe packaging
- Swarm = Workflow (no separate workflow concept)
- OpenClaw-style heartbeat for autonomous agent operation
- Dark green-tinted UI theme
- Chat as primary interface, not dashboard

## System Architecture
**Core Design:**
Nami employs a hierarchical agent structure: `Nami` (main orchestrator), `Spawn` (task-specific child agents), `Swarms` (workflows), and `SwarmQueen` (autonomous QA per swarm). A key concept is that a "Swarm IS the workflow," with steps embedded as prompt or code-based instructions. The system uses a configurable, interval-based autonomous heartbeat loop for continuous operation and monitoring. The "Engine Mind" integrates a Pi framework wrapper for self-healing, spawn validation, and auto-compaction.

**Technical Stack:**
- **Frontend:** React Single Page Application (SPA) utilizing Shadcn UI and Tailwind CSS for a dark green-tinted theme. Real-time updates are handled via WebSockets.
- **Backend:** Express.js and TypeScript, using in-memory storage for MVP and file-based persistence for configuration and agent states.
- **Inference:** Triple-provider system supporting OpenRouter.ai (BYOK), Google Gemini (OAuth2), and LM Studio (local inference). All leverage the OpenAI SDK with custom base URLs for flexibility across 400+ cloud models plus any local model.
- **Communication:** WebSockets for real-time events and a REST API for CRUD operations.
- **Persistence:** Dual-write system — all data (agents, swarms, chat sessions/messages, swarm messages, thoughts, memories, usage records, docs, config, heartbeat, engine state) is persisted to both disk (`.nami-data/` directory) and PostgreSQL. On startup, data loads from PostgreSQL first (with automatic one-time migration from disk files). This ensures data survives both server restarts and deployments. Critical DB writes (swarms, swarm messages) are `await`-ed to prevent silent failures. A periodic DB flush runs every 2 minutes as a safety net to re-sync all in-memory swarms and agents to PostgreSQL. Workspace files created by AI spawns (via `file_write`, `file_edit` tools) and the UI file editor are persisted to `nami_workspace_files` PostgreSQL table and automatically restored on startup. File deletions (including directory deletes) are synced to DB. Path keys are canonicalized to prevent duplicates.
- **Tools:** A comprehensive tool registry (`file_read`, `file_write`, `file_edit`, `file_search`, `file_list`, `shell_exec`, `web_browse`, `web_search`, `google_workspace`, `create_swarm`, `manage_swarm`, `server_restart`, `self_inspect`, `docs_read`, `docs_write`, `x_post_tweet`, `x_delete_tweet`, `x_get_status`, `browser_control`, `kanban`, `crm`) with a permission layer and function calling integration for LLMs.

**Key Features:**
- **Chat Module:** Central conversational interface with the Nami orchestrator. Supports multiple chat sessions with create/rename/delete/switch. Chat history persists to disk per session (`.nami-data/chat-history.json`, `.nami-data/chat-sessions.json`). Existing messages are auto-migrated to a "default" session for backward compatibility. Real-time streaming via WebSocket `chat_stream` events shows tool execution progress (tool names, active status) and chain-of-thought content during inference. Events are scoped by `sessionId` to prevent cross-session leakage. Error events clear the waiting state and show toast notifications. Swarm completion notifications are automatically posted to the active chat session by the SwarmQueen (via `notifySwarmCompletion`) and appear in real-time via `chat_message` WebSocket broadcast.
- **Heartbeat System:** Autonomous loop that pings Nami with instructions, reporting `< SLEEP >` when idle.
- **Engine Mind (Pi Framework):** Provides internal reasoning (Thoughts), stored context (Memory), self-healing tool execution, spawn validation, and chat history auto-compaction.
- **Engine State Control:** RUNNING, PAUSED, STOPPED states with corresponding controls.
- **Documentation System:** Agent-writable knowledge base with CRUD operations and disk persistence.
- **Self-Editing Capability:** Agents can modify their own codebase using tools like `file_edit`, `file_search`, and `server_restart`.
- **Scheduled Swarms:** Workflows can be scheduled with interval, daily, or weekly triggers.
- **Usage Tracking:** Monitors token usage, costs, and model performance per call.
- **Swarm Queen Loop:** Queens communicate via structured code blocks (`spawn`, `assign`, `review`, `complete`). Includes idle cycle detection (nudge at 3 idle cycles, force-complete at 5) to prevent infinite loops. Tool call activity also counts as non-idle. Format reminders are injected when the queen mentions spawns without using the required block syntax.
- **Swarm Detail Pages:** Provide a group-chat-style activity feed for monitoring swarm progress, including queen thinking, spawn actions, and errors.
- **File Viewer:** Allows browsing, viewing, editing, downloading, and deleting files within the workspace. Supports in-place text editing via the UI with save/cancel controls.
- **Kanban Board:** Project management board at `/kanban` with drag-and-drop columns and cards. Cards have priority levels (low/medium/high), status (not_started/in_progress/blocked/done), labels, and a comments/discussion section. Comments support `user`, `agent`, and `queen` author types. The `kanban` tool gives agents full CRUD control: create/update/delete cards, move cards between columns, create/rename/delete columns, list cards/columns, read and post comments. Data persists to `nami_kanban_columns`, `nami_kanban_cards`, and `nami_kanban_comments` PostgreSQL tables.
- **CRM Sequencing Module:** Full sales engagement sequencing system at `/crm/sequences`. Sequences define multi-channel outreach plans (email, phone_call, linkedin, social_media, research, wait, task steps). Contacts are enrolled and progress through steps with per-contact status (active/paused/completed). The sequence builder supports drag-and-drop step reordering. Contact intelligence reports analyze each contact's recommended channels, messaging approach, online footprint, pain points, and talking points. Account-level sequences coordinate outreach across multiple contacts within the same company. The CRM page (`/crm`) has three tabs: Accounts, Contacts, and Sequences. Routes: `/crm/sequences` (list), `/crm/sequences/:id` (detail). API endpoints: `/api/crm/sequences/*` (CRUD, enroll/unenroll, pause/resume/advance contact), `/api/crm/contacts/:id/analyze` (intelligence), `/api/crm/accounts/:id/sequences` (account sequences). Schema: `crmSequenceSchema` with `sequenceType`, `accountId`, `roleTargeting` fields; `contactIntelligenceSchema` on contacts; `sequenceStepSchema` with 7 channel types.
- **Audit Trail:** Comprehensive audit logging system tracking all CRUD operations across agents, swarms, CRM (accounts, contacts, sequences), kanban cards, docs, memories, and config. Audit entries record timestamp, action (created/updated/deleted/executed), record type, record name, actor (user/agent/system), and summary. Data persists to `nami_audit_log` PostgreSQL table. API endpoints: `GET /api/audit-log` (paginated, filterable by action/recordType/date), `GET /api/audit-log/csv` (full export). Settings page includes an Audit Trail card with table, filters, pagination, and CSV download. CRM accounts/contacts/sequences and kanban cards include `createdBy`/`lastModifiedBy` metadata displayed on detail views.
- **Namiextend Browser Extension:** Password-protected WebSocket endpoint at `/ws/namiextend` for connecting a Chrome extension. Extension authenticates by sending `{ type: "auth", token: "<password>" }`. The `browser_control` tool lets AI agents click, type, scroll, navigate, and read page content in the user's browser. Actions are logged to Postgres (`nami_browser_logs` table). Connection password is managed in Settings UI.
- **Integrations Page:** Dedicated `/integrations` page for managing external service accounts. Currently supports multiple Google accounts with add/remove/set-default/test operations. The default Google account's refresh token is used for Gemini API inference and gogCLI. Accounts are stored in `nami_google_accounts` Postgres table with email, refresh_token, display_name, avatar_url, and is_default flag. Google auth section moved from Settings to Integrations; Settings retains a status indicator with link to Integrations.

## Project Structure
```
client/                  React SPA (Vite + Shadcn UI + Tailwind)
  src/
    pages/               Chat, Spawns, Swarms, CRM, Kanban, Files,
                         Integrations, Settings, Usage, Docs, Engine Mind,
                         Heartbeat, Thoughts, Memory, Skills, Activity...
    components/          Sidebar, configurable table, status badge, theme toggle, UI kit
    lib/                 WebSocket client, query client, theme provider, utils
modules/                 Self-contained, reusable feature modules
  kanban/                Kanban board module (schema, db, routes, tool, frontend pages)
    index.ts             Module barrel export
    shared/schema.ts     Kanban-specific TypeScript types
    server/db.ts         createKanbanDb(pool) factory — DB layer
    server/routes.ts     registerKanbanRoutes(app, db, logAudit) — API routes
    server/tool.ts       createKanbanTool(db, logAudit) — agent tool factory
    client/pages/        Kanban frontend pages (reference copy)
  crm/                   CRM module (schema, db, routes, tool, sequence engine, frontend pages)
    index.ts             Module barrel export
    shared/schema.ts     CRM-specific TypeScript types
    server/db.ts         createCrmDb(pool) factory — DB layer
    server/routes.ts     registerCrmRoutes(app, deps) — API routes
    server/tool.ts       createCrmTool(db, logAudit, getAnalyzer) — agent tool factory
    server/sequence-engine.ts  Sequence execution + intelligence analyzer factories
    client/pages/        CRM frontend pages (reference copy)
server/
  index.ts               Express server entry point
  engine.ts              Core orchestration (heartbeat, agents, swarms, chat)
  openrouter.ts          OpenRouter.ai client with pricing cache
  gemini.ts              Google Gemini inference client
  tools.ts               Tool registry — imports kanban/CRM tools from module factories
  storage.ts             In-memory storage with JSON disk persistence
  db-persist.ts          PostgreSQL persistence — creates module DB instances, re-exports legacy aliases
  engine-mind.ts         Pi framework integration (self-healing, compaction)
  audit.ts               Audit trail logging
  namiextend.ts          Browser extension WebSocket bridge
  routes.ts              REST API + WebSocket setup — registers module routes
  x-api.ts               X (Twitter) API client
  toolExecutionGuard.ts  Tool execution safety layer
  toolValidation.ts      Tool input validation
  static.ts              Static file serving
  vite.ts                Vite dev server integration
shared/
  schema.ts              TypeScript types and Zod schemas
.nami-data/              Runtime data (auto-created, gitignored)
```

## Module Architecture
CRM and Kanban are modularized under `modules/` using a factory/dependency injection pattern:
- **DB factories** (`createKanbanDb(pool)`, `createCrmDb(pool)`) accept a PostgreSQL pool and return a db operations object
- **Route registrars** (`registerKanbanRoutes`, `registerCrmRoutes`) accept Express app + dependencies
- **Tool factories** (`createKanbanTool`, `createCrmTool`) return NamiTool objects for the agent tool registry
- **Backward compatibility**: `server/db-persist.ts` creates module instances and re-exports all legacy `dbGet*`/`dbUpsert*`/`dbDelete*` functions
- **Sequence engine lifecycle**: Managed via `globalThis.__startSequenceEngine` / `__stopSequenceEngine`, called on engine start/pause/stop

## External Dependencies
- **OpenRouter.ai:** For multi-model AI inference via BYOK.
- **Google Gemini API:** For AI inference, utilizing OAuth2 for authentication. Supports multiple Google accounts via the Integrations page. The default account's refresh token is used for API access and also provisions gogCLI for Google Workspace access (Gmail, Calendar, Drive, etc.).
- **PostgreSQL:** For persisting critical configuration and settings.
- **Chromium:** Headless browser used by the `web_browse` tool.
- **gogCLI:** Google Workspace Command Line Interface (v0.11.0) for `google_workspace` tool.
- **X (formerly Twitter) API:** For social media integration (`x_post_tweet`, `x_delete_tweet`).
- **Perplexity API:** Used by the `web_search` tool for real-time web search.