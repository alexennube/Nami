# Nami - Agentic Workflow Orchestrator

## Overview
Nami is an enterprise-grade multi-agent orchestration system for AgentNami.com. It manages hierarchical agent structures (Nami -> Spawns -> Swarms -> SwarmQueens) and integrates with OpenRouter.ai BYOK for multi-model inference. It features an autonomous heartbeat system for continuous agent monitoring, enabling sophisticated workflow automation and task delegation across various AI models. The project aims to provide a robust, scalable, and self-improving platform for agentic operations.

## User Preferences
- Node.js/TypeScript only (CTO requirement for desktop app compatibility)
- OpenRouter.ai for inference (not OpenAI directly)
- BYOK (Bring Your Own Key) support for future .exe packaging
- Enterprise-focused, Windows-compatible design
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
- **Inference:** Dual-provider system supporting OpenRouter.ai (BYOK) and Google Gemini (OAuth2). Both leverage the OpenAI SDK with custom base URLs for flexibility across 400+ models.
- **Communication:** WebSockets for real-time events and a REST API for CRUD operations.
- **Persistence:** Dual-write system — all data (agents, swarms, chat sessions/messages, swarm messages, thoughts, memories, usage records, docs, config, heartbeat, engine state) is persisted to both disk (`.nami-data/` directory) and PostgreSQL. On startup, data loads from PostgreSQL first (with automatic one-time migration from disk files). This ensures data survives both server restarts and deployments.
- **Tools:** A comprehensive tool registry (`file_read`, `file_write`, `file_edit`, `file_search`, `shell_exec`, `web_browse`, `web_search`, `google_workspace`, `ennube_mcp`, `create_swarm`, `manage_swarm`, `server_restart`, `self_inspect`, `docs_read/write`, `x_post_tweet`, `x_delete_tweet`, `browser_control`) with a permission layer and function calling integration for LLMs.

**Key Features:**
- **Chat Module:** Central conversational interface with the Nami orchestrator. Supports multiple chat sessions with create/rename/delete/switch. Chat history persists to disk per session (`.nami-data/chat-history.json`, `.nami-data/chat-sessions.json`). Existing messages are auto-migrated to a "default" session for backward compatibility.
- **Heartbeat System:** Autonomous loop that pings Nami with instructions, reporting `< SLEEP >` when idle.
- **Engine Mind (Pi Framework):** Provides internal reasoning (Thoughts), stored context (Memory), self-healing tool execution, spawn validation, and chat history auto-compaction.
- **Engine State Control:** RUNNING, PAUSED, STOPPED states with corresponding controls.
- **Documentation System:** Agent-writable knowledge base with CRUD operations and disk persistence.
- **Self-Editing Capability:** Agents can modify their own codebase using tools like `file_edit`, `file_search`, and `server_restart`.
- **Scheduled Swarms:** Workflows can be scheduled with interval, daily, or weekly triggers.
- **Usage Tracking:** Monitors token usage, costs, and model performance per call.
- **Swarm Queen Loop:** Queens communicate via structured code blocks (`spawn`, `assign`, `review`, `complete`). Includes idle cycle detection (nudge at 3 idle cycles, force-complete at 5) to prevent infinite loops. Tool call activity also counts as non-idle. Format reminders are injected when the queen mentions spawns without using the required block syntax.
- **Swarm Detail Pages:** Provide a group-chat-style activity feed for monitoring swarm progress, including queen thinking, spawn actions, and errors.
- **File Viewer:** Allows browsing, viewing, editing, and deleting files within the workspace. Supports in-place text editing via the UI with save/cancel controls.
- **Namiextend Browser Extension:** Password-protected WebSocket endpoint at `/ws/namiextend` for connecting a Chrome extension. Extension authenticates by sending `{ type: "auth", token: "<password>" }`. The `browser_control` tool lets AI agents click, type, scroll, navigate, and read page content in the user's browser. Actions are logged to Postgres (`nami_browser_logs` table). Connection password is managed in Settings UI.
- **Integrations Page:** Dedicated `/integrations` page for managing external service accounts. Currently supports multiple Google accounts with add/remove/set-default/test operations. The default Google account's refresh token is used for Gemini API inference and gogCLI. Accounts are stored in `nami_google_accounts` Postgres table with email, refresh_token, display_name, avatar_url, and is_default flag. Google auth section moved from Settings to Integrations; Settings retains a status indicator with link to Integrations.

## External Dependencies
- **OpenRouter.ai:** For multi-model AI inference via BYOK.
- **Google Gemini API:** For AI inference, utilizing OAuth2 for authentication. Supports multiple Google accounts via the Integrations page. The default account's refresh token is used for API access and also provisions gogCLI for Google Workspace access (Gmail, Calendar, Drive, etc.).
- **PostgreSQL:** For persisting critical configuration and settings.
- **Chromium:** Headless browser used by the `web_browse` tool.
- **gogCLI:** Google Workspace Command Line Interface (v0.11.0) for `google_workspace` tool.
- **Ennube MCP:** Remote server at `https://dev.ennube.ai/api/tools/mcp` for the `ennube_mcp` tool.
- **X (formerly Twitter) API:** For social media integration (`x_post_tweet`, `x_delete_tweet`).
- **Perplexity API:** Used by the `web_search` tool for real-time web search.