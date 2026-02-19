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
3. **Swarm** - Group of agents coordinated toward a single goal/objective
4. **SwarmQueen** - Autonomous QA manager per swarm, cannot have its primary objective changed by Nami

## Key Files
- `shared/schema.ts` - All TypeScript types and Zod schemas
- `server/engine.ts` - Core orchestration engine (EventBus, agent/swarm management)
- `server/openrouter.ts` - OpenRouter.ai BYOK client
- `server/routes.ts` - Express API routes + WebSocket setup
- `server/storage.ts` - In-memory storage layer (IStorage interface)
- `client/src/App.tsx` - Main app with sidebar layout
- `client/src/pages/` - Dashboard, Spawns, Swarms, Workflows, Activity, Settings
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/lib/websocket.ts` - WebSocket client for real-time events

## Recent Changes
- 2026-02-19: Initial MVP build with full agent hierarchy, OpenRouter BYOK, WebSocket events, monitoring dashboard

## Environment
- `OPENROUTER_API_KEY` - OpenRouter.ai API key (also configurable via Settings UI for BYOK)
- `SESSION_SECRET` - Session secret

## User Preferences
- Node.js/TypeScript only (CTO requirement for desktop app compatibility)
- OpenRouter.ai for inference (not OpenAI directly)
- BYOK (Bring Your Own Key) support for future .exe packaging
- Enterprise-focused, Windows-compatible design
