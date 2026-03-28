# WhatsApp Manager — مدير واتساب

## Project Overview
A professional full-stack TypeScript monorepo for managing multiple WhatsApp sessions. Features a bilingual (Arabic/English) RTL-ready dashboard, REST API with WebSocket real-time updates, role-based access control, granular permissions, and n8n workflow integration.

## Architecture
- **Monorepo**: pnpm workspaces
- **Backend**: `artifacts/api-server` — Express 5 + TypeScript, built with esbuild, WebSocket via Socket.IO
- **Frontend**: `artifacts/whatsapp-dashboard` — React 18 + Vite + TailwindCSS + shadcn/ui
- **Database**: `lib/db` — PostgreSQL via Drizzle ORM (pushed schema, no migrations)
- **WhatsApp Engine**: `@wppconnect-team/wppconnect` + Puppeteer/Chrome headless

## Key Features
- Multi-session WhatsApp management (connect/disconnect/delete)
- Auto-reconnect on server restart (only for non-manually-stopped sessions via `autoReconnect` flag)
- Bilingual UI: Arabic (RTL) + English
- JWT auth + HTTP-only cookies + API key auth (X-API-Key header)
- Role-based access: Admin (full access) / Employee (restricted to own sessions)
- Granular permissions per employee (11 permission keys)
- Max sessions limit per employee
- API key session restrictions (allowedSessionIds)
- Audit logging for create/delete session actions
- n8n workflow download with auto-injected API key and server URL
- Webhook support per session with event filtering
- Feature flags per session (send/receive by type)
- Real-time QR code display via WebSocket
- Dashboard with 7-day message volume chart

## Database Schema (PostgreSQL, Drizzle ORM)
- `users` — id, username, email, passwordHash, role, permissions (JSON), maxSessions, isActive, mustChangePassword
- `whatsapp_sessions` — id, userId, name, phoneNumber, status, autoReconnect, webhookUrl, webhookEvents, webhookSecret, features, totalMessagesSent, totalMessagesReceived
- `messages` — id, sessionId, direction, fromNumber, toNumber, messageType, content, mediaUrl, caption, status, timestamp
- `api_keys` — id, userId, name, keyHash, keyPrefix, allowedSessionIds, createdAt, lastUsedAt
- `audit_logs` — id, userId, username, action, sessionId, details, ipAddress, timestamp

## API Endpoints
All routes prefixed with `/api/`:
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /sessions`, `POST /sessions`, `GET /sessions/:id`, `DELETE /sessions/:id`
- `POST /sessions/:id/connect`, `POST /sessions/:id/disconnect`
- `GET /sessions/:id/qr`, `GET /sessions/:id/stats`, `GET /sessions/:id/messages`
- `PATCH /sessions/:id/webhook`, `PATCH /sessions/:id/features`
- `POST /send/text|image|video|audio|file|location|sticker`
- `POST /sessions/:id/send/text|image|video|audio|file|location|sticker`
- `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`
- `GET /api-keys`, `POST /api-keys`, `PATCH /api-keys/:id`, `DELETE /api-keys/:id`
- `GET /audit-logs` (admin only)
- `GET /dashboard/stats`
- `GET /n8n-workflow/download`

## Frontend Pages
- `/` — Dashboard (live stats + 7-day chart)
- `/sessions` — Session list with delete button
- `/sessions/:id` — Session detail (QR, stats, messages, webhook, features tabs)
- `/users` — User management with permissions + maxSessions (admin only)
- `/api-keys` — API key management with session restriction (admin sees all users' keys)
- `/send` — Send message UI (all types + file upload)

## Security
- Passwords: bcrypt (10 rounds)
- JWT: 7-day expiry, HS256, cryptographically generated secret via env var `JWT_SECRET`
- API keys: hashed with bcrypt; `keyPrefix` (first 8 chars) enables O(1) pre-filter before bcrypt comparison
- Rate limiting: login endpoint 20 req/15min, all API routes 300 req/min (via `express-rate-limit`)
- CORS: restricted to Replit domains + explicit `ALLOWED_ORIGINS` env var; all other origins blocked with proper error
- Trust proxy: `app.set("trust proxy", 1)` ensures correct real client IP behind Replit's mTLS proxy
- HTTP security headers: `helmet` middleware sets X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy, etc. (CSP disabled — JSON API only)
- Cookie security: `session_token` marked `secure: true` on Replit (checks `REPLIT_DEV_DOMAIN`) and in production; always `httpOnly`
- Request body limit: 50MB (reduced from 100MB to limit DoS surface; enough for base64-encoded media)
- Phone number validation: all send endpoints validate E.164 format (7–15 digits) before processing
- GPS coordinate validation: lat must be -90..90, lng must be -180..180; rejects NaN, Infinity, and out-of-range values
- Health check: `GET /` returns `{status:"ok"}` — silences noisy 404s from Replit's 30-second health pings
- Employees can only access their own sessions (ownership check on all routes)
- Granular permissions: 11 action keys, explicitly false = blocked, missing = allowed
- API key session restrictions: JSON array of allowed session IDs
- `mustChangePassword` flag: global middleware blocks all API calls (except login/logout/me and own PATCH) until password is changed
- Socket.IO: JWT auth middleware on connection — unauthenticated sockets are marked but not connected
- Webhook SSRF protection: `isPrivateUrl()` blocks localhost/private IPs; 10s timeout via AbortController; up to 3 retry attempts; `X-Webhook-Signature: sha256=HMAC` header when `webhookSecret` is set
- `webhookSecret` stored per session (set via `PATCH /sessions/:id/webhook`)
- Chrome path: resolved dynamically (cache scan → CHROME_PATH env var → fallback); no hardcoded version string
- Audit log for session create/delete actions with IP

## Running
- API server: `PORT=8080 pnpm --filter @workspace/api-server run dev` (port 8080)
- Dashboard: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev` (port 5000)
- Default admin: `admin` / `123456` (forced to change on first login)

## Windows Deployment Scripts (C:\whatsapp-manager)

| File | Purpose |
|------|---------|
| `start_wa.bat` | First-time install on a new machine. Clones from GitHub, generates `.env`, builds Docker images, starts production containers on port 5005. |
| `start_dev.bat` | First-time setup for development mode. Same as above but uses `docker-compose.dev.yml` with Vite HMR. Stops production containers first to free port 5005. |
| `update_wa.bat` | Update an existing installation. Pulls latest code from GitHub, stops the other environment, rebuilds images (`--no-cache`), and restarts chosen mode (production or development). |
| `run_wa.bat` | Daily launcher for production. Starts Docker if needed, stops dev containers, starts production containers. Used as the desktop shortcut target. |
| `run_dev.bat` | Daily launcher for development. Starts Docker if needed, stops production containers, starts dev containers. Used as the dev desktop shortcut target. |
| `cleanup_wa.bat` | Full uninstall. Stops and removes all containers and volumes (prod + dev), removes all Docker images, deletes desktop shortcuts and the `C:\whatsapp-manager` folder. Requires typing YES to confirm. |
| `reset_wa.bat` | Data reset (keep the app installed). Clears all database tables (sessions, messages, users, API keys, audit logs), removes WhatsApp token files, restarts the API so it re-seeds `admin / 123456`. Choose production or development. Requires double confirmation (YES then RESET). |

### Docker Details
- Production project name: `whatsapp_manager_v1` — containers: `whatsapp_manager_v1-db-1`, `whatsapp_manager_v1-api-1`, `whatsapp_manager_v1-dashboard-1`
- Development project name: `whatsapp_manager_dev` — containers: `whatsapp_manager_dev-db-1`, `whatsapp_manager_dev-api-1`, `whatsapp_manager_dev-dashboard-1`
- Both environments use port `5005` — scripts automatically stop the other before starting
- Images: `whatsapp-manager-api:latest`, `whatsapp-manager-dashboard:latest`, `whatsapp-manager-api-dev:latest`, `whatsapp-manager-dashboard-dev:latest`

## Dependencies (Backend Key)
- express 5, @wppconnect-team/wppconnect 1.41, socket.io 4.8, drizzle-orm, bcryptjs, jsonwebtoken, pino, sharp, uuid

## Dependencies (Frontend Key)
- React 18, Vite, TailwindCSS, shadcn/ui (Radix UI), TanStack Query, react-hook-form, zod, recharts, framer-motion, qrcode.react, wouter, date-fns, lucide-react
