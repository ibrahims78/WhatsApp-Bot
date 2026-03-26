# WhatsApp Manager — مدير واتساب

## Overview

A professional full-stack WhatsApp session management platform. Users can connect multiple WhatsApp accounts via QR code, send and receive all message types (text, image, video, audio, document), monitor real-time statistics, manage users and API keys, and integrate with external workflows (n8n, Zapier, etc.) via webhooks.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24, TypeScript 5.9 |
| Backend | Express.js v5 + Socket.IO 4 |
| WhatsApp | `@wppconnect-team/wppconnect` (Puppeteer-based) |
| Database | PostgreSQL + Drizzle ORM |
| Authentication | JWT + bcryptjs (cookies + Bearer token + X-API-Key) |
| Frontend | React 19 + Vite 7 |
| UI | Shadcn UI + Tailwind CSS v4 (glassmorphism) |
| State | Zustand (with persist) |
| Data Fetching | TanStack Query v5 |
| Routing | wouter |
| i18n | Custom bilingual store (Arabic/English, RTL/LTR) |
| Build | esbuild (API server), Vite (dashboard) |
| Codegen | Orval (React Query hooks + Zod schemas from OpenAPI) |

## Project Structure

```
workspace/
├── artifacts/
│   ├── api-server/          # Express API + Socket.IO server (PORT=8080)
│   └── whatsapp-dashboard/  # React + Vite dashboard (PORT=5000)
├── lib/
│   ├── db/                  # Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/            # OpenAPI 3.1 spec (single source of truth)
│   ├── api-zod/             # Generated Zod validation schemas
│   └── api-client-react/    # Generated React Query hooks
└── scripts/                 # Utility scripts
```

## Running the App

Two workflows run in parallel:
- **API Server**: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Dashboard**: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev`

The dashboard proxies `/api` and `/socket.io` requests to the API server at `localhost:8080`.

## Default Admin Credentials

Every time the server starts, it ensures a default admin user exists:
- **Username**: `admin`
- **Password**: `123456`

This is enforced on every restart (upsert logic in `artifacts/api-server/src/index.ts`).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (auto-set by Replit) |
| `PORT` | ✅ | Server port (8080 for API, 5000 for dashboard) |
| `BASE_PATH` | ✅ | Vite base path for dashboard (`/`) |
| `JWT_SECRET` | ⚠️ | JWT signing secret — set a strong value in production |

## Database

Schema managed by Drizzle ORM. Tables:
- `whatsapp_sessions` — session config, status, message counters
- `messages` — full message log (inbound/outbound) with timestamps
- `users` — user accounts with roles (admin/employee)
- `api_keys` — hashed API keys linked to users

Apply schema: `pnpm --filter @workspace/db push`

## API Endpoints

All endpoints are prefixed with `/api` and require either:
- `Authorization: Bearer <jwt>` header
- `X-API-Key: <key>` header

Key endpoints:
```
POST   /api/auth/login                    Login → JWT
GET    /api/auth/me                       Current user
GET    /api/sessions                      List sessions
POST   /api/sessions                      Create session
DELETE /api/sessions/:id                  Delete session
POST   /api/sessions/:id/connect          Start QR connection
POST   /api/sessions/:id/disconnect       Disconnect session
GET    /api/sessions/:id/qr               Get QR code
GET    /api/sessions/:id/messages         Message history
PATCH  /api/sessions/:id/webhook          Update webhook
PATCH  /api/sessions/:id/features         Update features
GET    /api/sessions/:id/stats            Session stats
POST   /api/sessions/:id/send/text        Send text message
POST   /api/sessions/:id/send/image       Send image
POST   /api/sessions/:id/send/video       Send video
POST   /api/sessions/:id/send/audio       Send audio
POST   /api/sessions/:id/send/file        Send document
GET    /api/dashboard/stats               Dashboard overview (last 7 days)
GET    /api/users                         List users (admin only)
POST   /api/users                         Create user (admin only)
GET    /api/api-keys                      List API keys
POST   /api/api-keys                      Create API key
DELETE /api/api-keys/:id                  Delete API key
```

## WebSocket Events (Socket.IO)

| Event | Payload | Description |
|-------|---------|-------------|
| `qr` | `{ sessionId, qr }` | Live QR code for scanning |
| `session_status` | `{ sessionId, status }` | Session status change |
| `message` | `{ sessionId, ...messageData }` | Incoming message |

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | JWT authentication |
| Dashboard | `/` | Live stats cards + 7-day message chart |
| Sessions | `/sessions` | List and manage WhatsApp sessions |
| Session Detail | `/sessions/:id` | QR scan, stats, messages, webhook, features |
| Send Message | `/send` | Send text/image/video/audio/document |
| Users | `/users` | Admin-only user management |
| API Keys | `/api-keys` | Generate, view, and revoke API keys |

## Key Implementation Notes

- **Admin upsert on startup**: `index.ts` always ensures `admin/123456` exists on every server start, creating or updating the record.
- **Real-time chart**: `/api/dashboard/stats` aggregates the last 7 days of messages from the `messages` table, refreshed every 30 seconds in the UI.
- **QR via WebSocket**: Puppeteer launches a headless Chrome per session; QR codes are streamed live to the dashboard.
- **Message logging**: Every inbound and outbound message is stored in the `messages` table with direction, type, and timestamp.
- **Webhook forwarding**: Incoming WhatsApp events are POST-ed to the session's configured webhook URL in real time.
- **RTL support**: The entire UI flips direction when Arabic is selected, using CSS logical properties (`ms-`, `ps-`, etc.).

## TypeScript Notes

- Every package extends `tsconfig.base.json` (composite: true).
- Always typecheck from root: `pnpm run typecheck`.
- esbuild handles JS bundling; `tsc` only emits `.d.ts` declaration files.
- Cross-package imports use project references — run `tsc --build` if they fail.
