# WhatsApp Manager — لوحة إدارة واتساب

<div align="center">

A professional, full-stack WhatsApp session management platform with a bilingual (Arabic/English) dashboard, REST API, and real-time WebSocket support.

لوحة تحكم احترافية متكاملة لإدارة جلسات واتساب متعددة مع دعم ثنائي اللغة (عربي/إنجليزي) وواجهة برمجية REST ودعم WebSocket للوقت الفعلي.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)

</div>

---

## ✨ Features / المميزات

- **Multi-Session WhatsApp Management** — Create and control multiple WhatsApp bot instances simultaneously.
- **Real-Time QR Code Authentication** — Live QR code streaming via WebSocket so users can link devices instantly.
- **Bilingual UI (Arabic + English)** — Full RTL support with native Arabic font (Cairo) and seamless language switching.
- **Light / Dark Mode** — Polished light and dark themes with persistent user preferences.
- **Messaging** — Send text, image, video, audio, and document messages through any connected session.
- **Webhook Integration** — Forward incoming WhatsApp events to any external system (n8n, Zapier, custom backends, etc.).
- **User & Role Management** — Admin panel for managing users and assigning roles (admin / employee).
- **API Key Management** — Generate and revoke API keys for programmatic external access.
- **Glassmorphism Design** — Modern premium SaaS aesthetic built with Tailwind CSS and Shadcn UI components.
- **Monorepo Architecture** — Clean pnpm workspace with full TypeScript support and shared libraries.

---

## 🏗️ Project Architecture / معمارية المشروع

This project is a **TypeScript monorepo** managed with `pnpm workspaces`. It is split into three layers:

```
workspace/
├── artifacts/
│   ├── api-server/          # Express.js REST API & WebSocket server
│   └── whatsapp-dashboard/  # React + Vite frontend dashboard
├── lib/
│   ├── db/                  # Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/            # OpenAPI specification (source of truth)
│   ├── api-zod/             # Shared Zod validation schemas
│   └── api-client-react/    # Auto-generated React Query hooks (orval)
├── scripts/                 # Utility & build scripts
├── pnpm-workspace.yaml      # Workspace & dependency catalog
└── tsconfig.json            # Root TypeScript configuration
```

### Key Libraries & Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js ≥ 20, TypeScript 5.9 | Language & runtime |
| Package Manager | pnpm (workspaces + catalog) | Monorepo dependency management |
| Backend Framework | Express.js v5 | HTTP server & routing |
| WhatsApp Protocol | `@wppconnect-team/wppconnect` | WhatsApp Web automation |
| Real-Time | Socket.IO 4 | WebSocket events (QR codes, session updates) |
| Database | PostgreSQL + Drizzle ORM | Persistent data storage |
| Authentication | JWT + bcryptjs | Stateless auth tokens + password hashing |
| Frontend | React 19 + Vite 7 | SPA with fast HMR |
| UI Components | Shadcn UI + Tailwind CSS v4 | Accessible, theme-aware component library |
| State Management | Zustand (with `persist`) | Global state with localStorage persistence |
| Data Fetching | TanStack Query v5 | Server state & caching |
| API Contract | OpenAPI 3 → orval codegen | Type-safe client hooks from spec |
| Validation | Zod | Schema validation on both client and server |
| Logging | pino | Structured JSON logging |
| Routing | wouter | Lightweight client-side routing |
| i18n | Custom translation store | Arabic (RTL) / English with Zustand |

---

## 📂 Module Details / تفاصيل الوحدات

### `artifacts/api-server` — Backend API

The core Express.js application. Responsibilities:

- **Session Lifecycle** — Create, connect, disconnect, and delete WhatsApp sessions using `wppconnect`. Each session corresponds to a linked WhatsApp account.
- **QR Code Streaming** — When a session is initializing, `wppconnect` generates a QR code. The server emits it via Socket.IO to any connected dashboard client in real time.
- **REST API** — Full CRUD endpoints for sessions, users, API keys, and messages. All routes are documented in the OpenAPI spec.
- **Authentication Middleware** — JWT bearer token verification for protected routes. API keys are also supported for programmatic access.
- **Webhook Forwarding** — Incoming WhatsApp messages/events are forwarded to the configured webhook URL per session (e.g., an n8n workflow).
- **Seed on Boot** — On first run, a default admin user is created automatically (`admin` / `admin123`).
- **Build System** — Uses `esbuild` for fast production bundling into `dist/index.mjs`.

**Entry point:** `artifacts/api-server/src/index.ts`

### `artifacts/whatsapp-dashboard` — Frontend Dashboard

A React SPA built with Vite. Pages and features:

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | JWT authentication form |
| Dashboard | `/` | Overview cards and message volume chart |
| Sessions | `/sessions` | List, create, and manage WhatsApp sessions |
| Session Detail | `/sessions/:id` | QR scan, statistics, message log, webhook & features config |
| Send Message | `/send` | Campaign/message sender (text, image, video, audio, document) |
| Users | `/users` | Admin-only user management |
| API Keys | `/api-keys` | Generate and revoke API access keys |

**Key frontend files:**

| File | Purpose |
|------|---------|
| `src/store/index.ts` | Zustand global store (auth, theme, language) |
| `src/lib/i18n.ts` | Translation dictionary for Arabic and English |
| `src/hooks/use-websocket.ts` | Socket.IO client hook for real-time QR updates |
| `src/components/layout/` | App shell: sidebar, header, page layout |

### `lib/db` — Database Layer

- **Schema** (`src/schema/`) — Drizzle ORM table definitions for `users`, `sessions`, `messages`, and `api_keys`.
- **Client** (`src/index.ts`) — PostgreSQL connection pool exported for use by the API server.
- **Migrations** — Run `pnpm --filter @workspace/db push` to push the schema to the database using `drizzle-kit`.

### `lib/api-spec` — OpenAPI Contract

Single source of truth for all API contracts. The spec is used to:
1. Document the API.
2. Generate type-safe React Query hooks via `orval` (`lib/api-client-react`).
3. Generate Zod schemas (`lib/api-zod`).

Run `pnpm run --filter @workspace/api-spec codegen` after any spec change to regenerate client code.

---

## 🚀 Getting Started / البدء

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- PostgreSQL database (connection string in `DATABASE_URL`)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd whatsapp-manager

# Install all workspace dependencies
pnpm install

# Push the database schema
pnpm --filter @workspace/db push
```

### Environment Variables

Create a `.env` file at the root or set these variables in your environment:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `PORT` | ✅ | `8080` | API server port |
| `JWT_SECRET` | ⚠️ | auto-generated | Secret for signing JWT tokens. **Set this in production!** |
| `ADMIN_PASSWORD` | ❌ | `admin123` | Password for the seeded admin user |

### Running in Development

Two processes need to run simultaneously:

```bash
# Terminal 1 — API Server (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend Dashboard (port 23097)
PORT=23097 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

The dashboard will be available at `http://localhost:23097`.

### Default Credentials

On first boot, a default admin account is seeded:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

> ⚠️ **Change the default password immediately in production.**

---

## 📖 API Reference / مرجع الـ API

All endpoints require a `Bearer` token (obtained from `POST /api/auth/login`) or a valid API key in the `Authorization` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login and receive a JWT token |
| `POST` | `/api/auth/logout` | Invalidate current session |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `POST` | `/api/sessions/:id/connect` | Connect (start) a session |
| `POST` | `/api/sessions/:id/disconnect` | Disconnect a session |
| `GET` | `/api/sessions/:id/qr` | Get current QR code |
| `GET` | `/api/sessions/:id/messages` | Get message history |
| `PATCH` | `/api/sessions/:id/webhook` | Update webhook URL |
| `PATCH` | `/api/sessions/:id/features` | Update allowed features |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/send/text` | Send a text message |
| `POST` | `/api/send/image` | Send an image |
| `POST` | `/api/send/video` | Send a video |
| `POST` | `/api/send/audio` | Send an audio file |
| `POST` | `/api/send/file` | Send a document/file |

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create a new user |
| `DELETE` | `/api/users/:id` | Delete a user |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/api-keys` | List API keys |
| `POST` | `/api/api-keys` | Generate a new API key |
| `DELETE` | `/api/api-keys/:id` | Revoke an API key |

### Real-Time Events (WebSocket)

Connect to the WebSocket server at `ws://localhost:8080` using Socket.IO.

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `qr` | Server → Client | `{ sessionId, qr }` | QR code data for a connecting session |
| `session_status` | Server → Client | `{ sessionId, status }` | Session status change |

---

## 🔧 Configuration / الإعدادات

### Session Features

Each session can have specific messaging features enabled or disabled. These are controlled from the Session Detail → Settings tab:

| Feature | Description |
|---------|-------------|
| `sendText` | Allow sending text messages |
| `sendImage` | Allow sending images |
| `sendVideo` | Allow sending videos |
| `sendAudio` | Allow sending audio |
| `sendFile` | Allow sending documents |
| `receiveText` | Process incoming text |
| `receiveImage` | Process incoming images |
| `receiveVideo` | Process incoming videos |
| `receiveAudio` | Process incoming audio |
| `receiveFile` | Process incoming documents |

### Webhook Payload

When a message is received on a session with a configured webhook URL, the server sends an HTTP POST:

```json
{
  "sessionId": "session-uuid",
  "event": "message",
  "data": {
    "from": "1234567890@c.us",
    "body": "Hello!",
    "type": "chat",
    "timestamp": 1706000000
  }
}
```

---

## 🌍 Internationalization / الترجمة

The dashboard supports **Arabic (ar)** and **English (en)**.

- Default language: **Arabic (RTL)**
- Default theme: **Light mode**
- Settings are persisted in `localStorage`

To add a new language:

1. Add a new entry to `artifacts/whatsapp-dashboard/src/lib/i18n.ts`:
   ```typescript
   export const translations = {
     en: { ... },
     ar: { ... },
     fr: { ... }  // Add your language
   };
   ```
2. Update `SupportedLanguage` type and handle font/direction in `applyLanguage()` in `store/index.ts`.

---

## 🏭 Production Deployment / النشر للإنتاج

### Build

```bash
# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend (outputs to artifacts/whatsapp-dashboard/dist/public/)
pnpm --filter @workspace/whatsapp-dashboard run build
```

### Production Considerations

1. **Set `JWT_SECRET`** to a long, random string (e.g., `openssl rand -base64 64`).
2. **Change default admin password** after first login.
3. **Use a process manager** (PM2, systemd) for the API server.
4. **Serve the frontend** as static files via Nginx or any CDN.
5. **Configure PostgreSQL** with proper connection pooling and TLS.
6. **Puppeteer/Chromium** — `wppconnect` uses Puppeteer internally. Ensure Chromium is available in your production environment.

### Docker (Example)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install
RUN pnpm --filter @workspace/db push
RUN pnpm --filter @workspace/api-server run build
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
```

---

## 📁 File Structure Reference

```
artifacts/api-server/src/
├── index.ts              # Server entry point, middleware, seed
├── routes/
│   ├── auth.ts           # Login / logout
│   ├── sessions.ts       # Session CRUD + connect/disconnect
│   ├── send.ts           # Message sending endpoints
│   ├── users.ts          # User management
│   ├── api-keys.ts       # API key management
│   └── messages.ts       # Message history
├── middleware/
│   ├── auth.ts           # JWT & API key verification
│   └── error.ts          # Global error handler
└── services/
    └── wppconnect.ts     # WhatsApp session manager

artifacts/whatsapp-dashboard/src/
├── App.tsx               # Router + QueryClient provider
├── main.tsx              # React root
├── store/index.ts        # Zustand global state
├── lib/
│   ├── i18n.ts           # Translation dictionary
│   └── utils.ts          # Tailwind cn() helper
├── components/
│   ├── layout/           # App shell (sidebar, header, layout)
│   └── ui/               # Shadcn UI components
├── pages/
│   ├── login.tsx
│   ├── dashboard.tsx
│   ├── sessions/
│   │   ├── index.tsx
│   │   └── detail.tsx
│   ├── users/index.tsx
│   ├── api-keys/index.tsx
│   └── send/index.tsx
└── hooks/
    ├── use-websocket.ts  # Socket.IO integration
    └── use-toast.ts      # Toast notifications

lib/
├── db/src/
│   ├── schema/           # Drizzle table definitions
│   └── index.ts          # DB client export
├── api-spec/             # openapi.yaml
├── api-zod/              # Generated Zod schemas
└── api-client-react/src/ # Generated React Query hooks
```

---

## 🤝 Contributing / المساهمة

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes following the existing code style.
4. Update translations in `lib/i18n.ts` if adding UI text.
5. Run the API server and dashboard to verify your changes.
6. Submit a pull request with a clear description.

### Code Style

- TypeScript strict mode enabled.
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) for RTL compatibility.
- All UI strings must have both `en` and `ar` entries in `i18n.ts`.
- Follow the existing Shadcn UI component patterns.

---

## 📄 License

MIT License — feel free to use and modify for personal or commercial projects.

---

<div align="center">
  Built with ❤️ using TypeScript, React, Express, and wppconnect
</div>
