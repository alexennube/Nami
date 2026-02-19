# Nami - Agentic Workflow Orchestrator

## Overview
Nami is an enterprise-grade multi-agent orchestration system for AgentNami.com. It manages hierarchical agent structures (Nami -> Spawns -> Swarms -> SwarmQueens) with OpenRouter.ai BYOK integration for multi-model inference across 400+ AI models.

## Architecture
- **Frontend**: React SPA with Shadcn UI, Tailwind CSS, Recharts, WebSocket real-time updates
- **Backend**: Express.js + TypeScript with in-memory storage (MVP), OpenRouter client, EventBus
- **Inference**: OpenRouter.ai API (OpenAI SDK configured with custom base URL) - BYOK support
- **Communication**: WebSocket for real-time events, REST API for CRUD

## Agent Hierarchy
1. **Nami** - Main brain, creates and manages all spawns and swarms
2. **Spawn** - Child agents created by Nami, perform specific tasks
3. **Swarm** - Group of agents coordinated toward a single goal/objective (swarm = workflow)
4. **SwarmQueen** - Autonomous QA manager per swarm, cannot have its primary objective changed by Nami

## Key Concepts
- **Swarm = Workflow**: A swarm IS the workflow. Steps are embedded in the swarm as either prompt-based or code-based instructions.
- **Chat Module**: Direct conversational interface with Nami, the primary orchestrator.
- **No separate workflow builder**: The workflow is defined within the swarm via prompt or executable code steps.

## Key Files
- `shared/schema.ts` - All TypeScript types and Zod schemas
- `server/engine.ts` - Core orchestration engine (EventBus, agent/swarm management, chat with Nami)
- `server/openrouter.ts` - OpenRouter.ai BYOK client
- `server/routes.ts` - Express API routes + WebSocket setup
- `server/storage.ts` - In-memory storage layer (IStorage interface)
- `client/src/App.tsx` - Main app with sidebar layout
- `client/src/pages/` - Dashboard, Chat, Spawns, Swarms, Activity, Settings
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/lib/websocket.ts` - WebSocket client for real-time events

## API Routes
- `GET/POST /api/chat` - Chat with Nami orchestrator
- `GET/POST /api/agents` - CRUD for spawn agents
- `GET/POST /api/swarms` - CRUD for swarms (with embedded workflow steps)
- `POST /api/swarms/:id/run` - Execute swarm workflow steps
- `GET /api/stats` - System statistics
- `GET /api/events` - Activity log
- `GET/PUT /api/config` - System configuration (BYOK API key)

## Recent Changes
- 2026-02-19: Restructured architecture - merged workflow into swarm (swarm = workflow), added Chat module for direct Nami interaction, removed separate workflow builder, added prompt/code step types to swarms

## Environment
- `OPENROUTER_API_KEY` - OpenRouter.ai API key (also configurable via Settings UI for BYOK)
- `SESSION_SECRET` - Session secret

## User Preferences
- Node.js/TypeScript only (CTO requirement for desktop app compatibility)
- OpenRouter.ai for inference (not OpenAI directly)
- BYOK (Bring Your Own Key) support for future .exe packaging
- Enterprise-focused, Windows-compatible design
- Swarm = Workflow (no separate workflow concept)
- Chat module for direct interaction with Nami
