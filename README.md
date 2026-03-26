# WhatsApp Manager — مدير واتساب

<div align="center">

**[English](#english-documentation) | [العربية](#arabic-documentation)**

A professional full-stack WhatsApp session management platform with bilingual (Arabic/English) dashboard, REST API, and real-time WebSocket support.

لوحة تحكم احترافية متكاملة لإدارة جلسات واتساب متعددة مع دعم ثنائي اللغة (عربي/إنجليزي) وواجهة برمجية REST ودعم WebSocket للوقت الفعلي.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)

</div>

---

<a name="english-documentation"></a>
## English Documentation

### Features

- **Multi-Session Management** — Create and control multiple WhatsApp accounts simultaneously
- **Real-Time QR Code Scanning** — Live QR streaming via WebSocket to link devices instantly
- **Live Dashboard Stats** — Real-time overview cards and a 7-day message volume chart pulled directly from the database
- **Bilingual UI (Arabic + English)** — Full RTL support with native Arabic font (Cairo) and seamless language switching
- **Light / Dark Mode** — Polished themes with persistent user preferences
- **Send Messages** — Text, image, video, audio, and document messages via UI or API
- **Webhook Integration** — Forward incoming WhatsApp events to n8n, Zapier, or any custom backend
- **User & Role Management** — Admin panel with role-based access (admin / employee)
- **API Key Management** — Generate and revoke API keys for programmatic access
- **User Profile Dropdown** — Header dropdown with account info, role badge, and one-click sign-out
- **Glassmorphism Design** — Modern SaaS aesthetic with Tailwind CSS v4 and Shadcn UI

### Architecture

This is a TypeScript monorepo managed with `pnpm workspaces`:

```
workspace/
├── artifacts/
│   ├── api-server/          # Express.js REST API & Socket.IO WebSocket server
│   └── whatsapp-dashboard/  # React + Vite frontend dashboard
├── lib/
│   ├── db/                  # Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/            # OpenAPI specification (single source of truth)
│   ├── api-zod/             # Generated Zod validation schemas
│   └── api-client-react/    # Generated React Query hooks
└── scripts/                 # Utility & build scripts
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 20, TypeScript 5.9 |
| Package Manager | pnpm workspaces + catalog |
| Backend | Express.js v5 + Socket.IO 4 |
| WhatsApp | `@wppconnect-team/wppconnect` (Puppeteer-based) |
| Database | PostgreSQL + Drizzle ORM |
| Authentication | JWT + bcryptjs |
| Frontend | React 19 + Vite 7 |
| UI Components | Shadcn UI + Tailwind CSS v4 |
| State Management | Zustand (with `persist`) |
| Data Fetching | TanStack Query v5 |
| Routing | wouter |
| i18n | Custom translation store (Arabic/English) |

### Getting Started

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 10, PostgreSQL database.

```bash
# Install all workspace dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db push
```

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `PORT` | ✅ | — | Server port (`8080` for API, `5000` for dashboard) |
| `JWT_SECRET` | ⚠️ | auto-generated | JWT signing secret — **set this in production!** |

**Run in development (two terminals):**

```bash
# Terminal 1 — API Server
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Dashboard
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

Open `http://localhost:5000` — default login: **`admin` / `123456`**.

> ⚠️ The admin account is automatically recreated with these credentials on every server start. Set a strong `JWT_SECRET` before deploying to production.

### Default Admin Account

On every server startup, the system ensures a default admin user exists:
- **Username:** `admin`
- **Password:** `123456`
- **Role:** Administrator (full access)

This account is created automatically if it doesn't exist, or updated if it does. It cannot be permanently deleted through the UI alone since it is re-seeded on restart.

### Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | JWT authentication |
| Dashboard | `/` | Live overview cards + 7-day message volume chart |
| Sessions | `/sessions` | List and manage WhatsApp sessions |
| Session Detail | `/sessions/:id` | QR scan, stats, messages, webhook & features |
| Send Message | `/send` | Send text, image, video, audio, document |
| Users | `/users` | Admin-only user management |
| API Keys | `/api-keys` | Generate and revoke API keys |

### API Reference

All endpoints require a `Bearer` JWT token or `X-API-Key` header.

**Authentication**
```
POST /api/auth/login     — Login → receive JWT token
GET  /api/auth/me        — Get current authenticated user
POST /api/auth/logout    — Logout (clears session cookie)
```

**Dashboard**
```
GET  /api/dashboard/stats           — Overview stats + last 7 days message chart
```

**Sessions**
```
GET    /api/sessions                  — List all sessions
POST   /api/sessions                  — Create new session
GET    /api/sessions/:id              — Get session details
DELETE /api/sessions/:id              — Delete session
POST   /api/sessions/:id/connect      — Start QR connection process
POST   /api/sessions/:id/disconnect   — Disconnect session
GET    /api/sessions/:id/qr           — Get current QR code
GET    /api/sessions/:id/messages     — Message history (paginated)
GET    /api/sessions/:id/stats        — Session message statistics
PATCH  /api/sessions/:id/webhook      — Update webhook URL and events
PATCH  /api/sessions/:id/features     — Update allowed features
```

**Messaging**
```
POST /api/sessions/:id/send/text     — Send text message
POST /api/sessions/:id/send/image    — Send image (URL or upload)
POST /api/sessions/:id/send/video    — Send video (URL or upload)
POST /api/sessions/:id/send/audio    — Send audio (URL or upload)
POST /api/sessions/:id/send/file     — Send document (URL or upload)
```

**Users** *(admin only)*
```
GET    /api/users        — List all users
POST   /api/users        — Create user
PATCH  /api/users/:id    — Update user
DELETE /api/users/:id    — Delete user
```

**API Keys**
```
GET    /api/api-keys        — List your API keys
POST   /api/api-keys        — Create new API key
DELETE /api/api-keys/:id    — Revoke API key
```

### WebSocket Events

Connect via Socket.IO to receive real-time updates:

| Event | Payload | Description |
|-------|---------|-------------|
| `qr` | `{ sessionId, qr }` | QR code for a connecting session |
| `session_status` | `{ sessionId, status }` | Session status change |
| `message` | `{ sessionId, ...data }` | Incoming message received |

### Production Deployment

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Build dashboard (output → artifacts/whatsapp-dashboard/dist/public/)
pnpm --filter @workspace/whatsapp-dashboard run build
```

Production checklist:
1. Set `JWT_SECRET` to a strong random string: `openssl rand -base64 64`
2. Ensure `DATABASE_URL` points to a production PostgreSQL database
3. Use a process manager (PM2, systemd) for the API server
4. Serve the frontend as static files via Nginx or a CDN
5. Ensure Chromium is available in the runtime environment (required by wppconnect/Puppeteer)

---

<a name="arabic-documentation"></a>
## توثيق باللغة العربية

### نظرة عامة

مدير واتساب هو منصة متكاملة لإدارة جلسات واتساب متعددة. تُتيح لك ربط حسابات واتساب عبر مسح QR، وإرسال واستقبال جميع أنواع الرسائل برمجياً، ومراقبة الإحصائيات الحية، وإدارة المستخدمين ومفاتيح API، وتوصيلها بأدوات الأتمتة مثل n8n.

### المميزات

- **إدارة جلسات متعددة** — ربط وإدارة عدة حسابات واتساب في آنٍ واحد
- **مسح QR في الوقت الفعلي** — ربط أجهزة جديدة عبر WebSocket مباشرةً من اللوحة
- **إحصائيات حية** — بطاقات ملخص ومخطط رسائل آخر 7 أيام مسحوبة مباشرة من قاعدة البيانات
- **واجهة عربية/إنجليزية** — دعم RTL كامل مع خط Cairo للعربية وتبديل سلس بين اللغتين
- **الوضع الداكن/الفاتح** — تبديل ثيمات مع حفظ تفضيلات المستخدم
- **إرسال الرسائل** — نص وصور وفيديو وصوت ومستندات عبر الواجهة أو API
- **دعم Webhook** — إعادة توجيه الرسائل الواردة إلى n8n أو أي نظام خارجي
- **إدارة المستخدمين** — لوحة إدارة مع صلاحيات مدير وموظف
- **مفاتيح API** — إنشاء وإلغاء مفاتيح API للوصول البرمجي
- **قائمة منسدلة للمستخدم** — معلومات الحساب والصلاحية وزر تسجيل الخروج في الهيدر

### هيكل المشروع

```
workspace/
├── artifacts/
│   ├── api-server/          # خادم API Express.js + Socket.IO
│   └── whatsapp-dashboard/  # لوحة التحكم React + Vite
├── lib/
│   ├── db/                  # مخطط Drizzle ORM + عميل PostgreSQL
│   ├── api-spec/            # مواصفات OpenAPI (المرجع الوحيد للـ API)
│   ├── api-zod/             # مخططات Zod المُولَّدة
│   └── api-client-react/    # خطافات React Query المُولَّدة
└── scripts/                 # سكريبتات مساعدة
```

### التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| وقت التشغيل | Node.js ≥ 20، TypeScript 5.9 |
| إدارة الحزم | pnpm workspaces |
| الخادم | Express.js v5 + Socket.IO 4 |
| واتساب | wppconnect (مبني على Puppeteer) |
| قاعدة البيانات | PostgreSQL + Drizzle ORM |
| المصادقة | JWT + bcryptjs |
| الواجهة الأمامية | React 19 + Vite 7 |
| مكونات UI | Shadcn UI + Tailwind CSS v4 |
| إدارة الحالة | Zustand |
| جلب البيانات | TanStack Query v5 |

### البدء السريع

**المتطلبات:** Node.js ≥ 20، pnpm ≥ 10، قاعدة بيانات PostgreSQL.

```bash
# تثبيت جميع الاعتماديات
pnpm install

# رفع مخطط قاعدة البيانات
pnpm --filter @workspace/db push
```

**متغيرات البيئة:**

| المتغير | مطلوب | الوصف |
|---------|-------|-------|
| `DATABASE_URL` | ✅ | رابط اتصال PostgreSQL |
| `PORT` | ✅ | المنفذ (8080 للـ API، 5000 للوحة) |
| `JWT_SECRET` | ⚠️ | مفتاح JWT — **يجب ضبطه في الإنتاج!** |

**تشغيل بيئة التطوير:**

```bash
# الطرفية الأولى — خادم API
PORT=8080 pnpm --filter @workspace/api-server run dev

# الطرفية الثانية — لوحة التحكم
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

افتح `http://localhost:5000` — بيانات الدخول: **`admin` / `123456`**

### حساب المدير الافتراضي

في كل مرة يشتغل فيها الخادم، يتأكد النظام من وجود حساب المدير:
- **اسم المستخدم:** `admin`
- **كلمة السر:** `123456`
- **الصلاحية:** مدير (وصول كامل)

يُنشأ الحساب تلقائياً عند أول تشغيل، أو يُحدَّث إذا كان موجوداً. تأكد من ضبط `JWT_SECRET` قوي قبل النشر للإنتاج.

### صفحات لوحة التحكم

| الصفحة | المسار | الوصف |
|--------|--------|-------|
| تسجيل الدخول | `/login` | المصادقة بـ JWT |
| لوحة القيادة | `/` | بطاقات الملخص الحية + مخطط رسائل آخر 7 أيام |
| الجلسات | `/sessions` | قائمة وإدارة جلسات واتساب |
| تفاصيل الجلسة | `/sessions/:id` | QR، إحصائيات، رسائل، Webhook، ميزات |
| إرسال رسالة | `/send` | إرسال نص وصور وفيديو وصوت ومستندات |
| المستخدمون | `/users` | إدارة المستخدمين (مدراء فقط) |
| مفاتيح API | `/api-keys` | إنشاء وإلغاء مفاتيح الوصول |

### أمثلة API

```bash
# تسجيل الدخول
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'

# إرسال رسالة نصية
curl -X POST http://localhost:8080/api/sessions/{SESSION_ID}/send/text \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "966501234567", "text": "مرحباً!"}'

# إحصائيات لوحة القيادة
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/dashboard/stats
```

### أحداث WebSocket الفورية

اتصل عبر Socket.IO لاستقبال التحديثات الفورية:

| الحدث | البيانات | الوصف |
|-------|---------|-------|
| `qr` | `{ sessionId, qr }` | رمز QR للجلسة قيد الاتصال |
| `session_status` | `{ sessionId, status }` | تغيير حالة الجلسة |
| `message` | `{ sessionId, ...data }` | رسالة واردة جديدة |

### النشر للإنتاج

```bash
# بناء خادم API
pnpm --filter @workspace/api-server run build

# بناء لوحة التحكم
pnpm --filter @workspace/whatsapp-dashboard run build
```

قائمة التحقق للإنتاج:
1. تعيين `JWT_SECRET` لقيمة عشوائية قوية: `openssl rand -base64 64`
2. التأكد من توجيه `DATABASE_URL` لقاعدة بيانات إنتاجية
3. استخدام مدير عمليات (PM2 أو systemd) لخادم API
4. تقديم الواجهة الأمامية كملفات ثابتة عبر Nginx أو CDN
5. التأكد من توفر Chromium في بيئة التشغيل (مطلوب لـ wppconnect)

---

## Contributing / المساهمة

- Fork the repository and create a feature branch.
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) for RTL compatibility.
- All new UI strings must have both `en` and `ar` entries in `artifacts/whatsapp-dashboard/src/lib/i18n.ts`.
- Follow existing Shadcn UI component patterns.

---

## License / الرخصة

MIT License — free to use and modify for personal or commercial projects.

---

<div align="center">
  Built with TypeScript · React · Express · wppconnect
</div>
