# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jaaz is an open-source multimodal creative assistant (Canva AI alternative). It's an Electron desktop app with a Python backend and React frontend that supports AI image/video generation, infinite canvas, and chat-based creative workflows.

## Development Commands

### Frontend (React)
```bash
cd react
npm install --force    # use --force due to dependency conflicts
npm run dev            # Vite dev server on port 5174, proxies /api to backend :8000
npm run build          # tsc -b && vite build
npm run lint           # eslint
```

### Backend (Python >= 3.12)
```bash
cd server
pip install -r requirements.txt
python main.py         # FastAPI + uvicorn on port 8000
```

### Electron (desktop app)
```bash
npm run dev            # runs both React dev + Electron concurrently
npm run build:mac      # electron-builder for macOS
npm run build:win      # electron-builder for Windows
```

### Tests
```bash
# Root-level (Electron tests)
npm test               # vitest (includes **/*.test.js)
npm run test:run       # single run
npm run test:watch     # watch mode

# Backend tests are individual scripts:
cd server && python -m pytest tests/
```

## Architecture

### Three-Layer Structure

```
electron/          Electron shell (main.js, preload.js, IPC handlers)
react/             Frontend SPA (React 19 + TypeScript)
server/            Backend API (Python FastAPI)
```

### Backend (`server/`)

- **Entry**: `main.py` — FastAPI app with Socket.IO, lifespan initializes `config_service` and `tool_service`
- **Routers** (`routers/`): REST endpoints organized by domain (chat, canvas, image, video, auth, billing, templates, etc.)
- **Services** (`services/`):
  - `new_chat/` — Primary chat system: `chat_service.py` orchestrates conversations, `tuzi_llm_service.py` handles LLM calls and image generation routing, `logic_agent.py` for agent logic
  - `langgraph_service/` — LangGraph-based agent system with `agent_manager.py` and `agent_service.py`
  - `tool_service.py` — Tool registry mapping tool IDs to display names, providers, and functions
  - `config_service.py` — Configuration management (models, API keys)
  - `db_service.py` — SQLite via aiosqlite (`localmanus.db`)
  - `magic_service.py` / `magic_draw_service.py` — Canvas magic features
  - `video_generation_service.py` — Video generation orchestration
- **Tools** (`tools/`): Each file is a LangGraph tool for a specific image/video model provider (Google Nano Banana, GPT Image, Flux, Midjourney, Imagen, Kling, VEO3, etc.)
  - `image_providers/` — Provider-specific image generation backends
  - `video_providers/` — Provider-specific video generation backends
- **Models** (`models/`): Pydantic models (`db_model.py`, `config_model.py`, `tool_model.py`, `websocket_message.py`)
- **Communication**: Socket.IO (`python-socketio`) for real-time WebSocket messaging between frontend and backend

### Frontend (`react/`)

- **Framework**: React 19 + TypeScript + Vite + TailwindCSS v4
- **Routing**: TanStack Router with file-based routes in `src/routes/`
  - `index.tsx` — Home/chat page
  - `canvas.$id.tsx` — Infinite canvas page
  - `sora.tsx` — Video generation
  - `templates.tsx` / `template-use.$templateId.tsx` — Template system
- **State Management**:
  - Zustand stores in `src/stores/` (`canvas.ts`, `configs.ts`)
  - React Context providers in `src/contexts/` (`configs.tsx`, `socket.tsx`, `AuthContext.tsx`, `canvas.tsx`)
  - TanStack Query with IndexedDB persistence for server state
- **Key Components** (`src/components/`):
  - `chat/` — Chat UI, message rendering, model selector, textarea, canvas handler
  - `canvas/` — Excalidraw-based infinite canvas
  - `settings/` — Settings dialogs, model/provider configuration
  - `ui/` — Shared UI primitives (Radix UI + shadcn/ui pattern)
- **API Layer** (`src/api/`): REST client functions organized by domain
- **Real-time**: Socket.IO client via `src/contexts/socket.tsx` and `src/lib/socket.ts`
- **i18n**: i18next with browser language detection (`src/i18n/`)
- **Path alias**: `@/` maps to `react/src/`

### Electron (`electron/`)

- `main.js` — Main process, spawns Python backend, serves React build
- `preload.js` — Context bridge for IPC
- `ipcHandlers.js` — IPC handlers for native features

## Key Patterns

- **Tool Registration**: Image/video tools are defined in `server/tools/`, registered in `server/services/tool_service.py` with `TOOL_MAPPING` dict containing `display_name`, `type`, `provider`, and `tool_function`
- **Model Name Routing**: `tuzi_llm_service.py` maps display names to actual model IDs before API calls
- **Frontend Config Flow**: `ConfigsProvider` in `configs.tsx` manages model selection, tool selection, and persists choices to localStorage
- **Canvas Architecture**: Uses Excalidraw library with custom extensions for AI-powered drawing

## Post-Development: Build & Restart

开发完成后，根据修改的内容判断是否需要重新构建前端或重启后端。通过 tmux pane 操作：

- **前端代码修改**（`react/` 下的文件）：在 tmux pane `5:1.1`（open-jaaz前端）中运行 `bash build.sh`（即 `npx vite build`）
- **后端代码修改**（`server/` 下的文件）：在 tmux pane `5:1.2`（open-jaaz服务端）中先 Ctrl+C 停止当前进程，再运行 `python main.py` 重启

可使用 `mcp__tmux-pane-reader__send_command` 发送命令，使用 `mcp__tmux-pane-reader__read_pane` 检查执行结果。

## Code Style

- **Python**: Black formatter (line-length 88), isort, ruff. See `pyproject.toml`
- **TypeScript/React**: Prettier (no semicolons, single quotes, JSX single quotes, 100 char width). See `.prettierrc.json`
- **Commits**: Use conventional commit style with emoji prefix (e.g., `feat(scope): description`)
