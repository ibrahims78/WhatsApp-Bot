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
- **Bilingual UI (Arabic + English)** — Full RTL support with native Arabic font (Cairo) and seamless language switching
- **Light / Dark Mode** — Polished themes with persistent user preferences
- **Send Messages** — Text, image, video, audio, and document messages via UI or API
- **Webhook Integration** — Forward incoming WhatsApp events to n8n, Zapier, or any custom backend
- **User & Role Management** — Admin panel with role-based access (admin / employee)
- **API Key Management** — Generate and revoke API keys for programmatic access
- **Glassmorphism Design** — Modern SaaS aesthetic with Tailwind CSS and Shadcn UI

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
| i18n | Custom translation store |

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
| `PORT` | ✅ | `8080` | API server port |
| `JWT_SECRET` | ⚠️ | auto-generated | JWT signing secret — **set this in production!** |
| `ADMIN_PASSWORD` | ❌ | `admin123` | Password for the seeded admin user |

**Run in development (two terminals):**

```bash
# Terminal 1 — API Server
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Dashboard
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

Open `http://localhost:5000` — default login: `admin` / `admin123`.

> ⚠️ **Change the default password immediately in production.**

### Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | JWT authentication |
| Dashboard | `/` | Overview cards and message volume chart |
| Sessions | `/sessions` | List and manage WhatsApp sessions |
| Session Detail | `/sessions/:id` | QR scan, stats, messages, webhook & features |
| Send Message | `/send` | Send text, image, video, audio, document |
| Users | `/users` | Admin-only user management |
| API Keys | `/api-keys` | Generate and revoke API keys |

### API Reference

All endpoints require a `Bearer` JWT token or `X-API-Key` header.

**Authentication**
```
POST /api/auth/login     — Login and receive JWT
POST /api/auth/logout    — Logout
```

**Sessions**
```
GET    /api/sessions              — List all sessions
POST   /api/sessions              — Create session
GET    /api/sessions/:id          — Get session
DELETE /api/sessions/:id          — Delete session
POST   /api/sessions/:id/connect  — Connect session
POST   /api/sessions/:id/disconnect — Disconnect session
GET    /api/sessions/:id/qr       — Get QR code
GET    /api/sessions/:id/messages — Message history
PATCH  /api/sessions/:id/webhook  — Update webhook URL
PATCH  /api/sessions/:id/features — Update features
```

**Messaging**
```
POST /api/sessions/:id/send/text     — Send text
POST /api/sessions/:id/send/image    — Send image
POST /api/sessions/:id/send/video    — Send video
POST /api/sessions/:id/send/audio    — Send audio
POST /api/sessions/:id/send/file     — Send document
```

### WebSocket Events

Connect via Socket.IO to receive real-time updates:

| Event | Payload | Description |
|-------|---------|-------------|
| `qr` | `{ sessionId, qr }` | QR code for a connecting session |
| `session_status` | `{ sessionId, status }` | Session status change |

### Production Deployment

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Build dashboard (output → artifacts/whatsapp-dashboard/dist/public/)
pnpm --filter @workspace/whatsapp-dashboard run build
```

Production checklist:
1. Set `JWT_SECRET` to a strong random string (`openssl rand -base64 64`)
2. Change the default admin password after first login
3. Use a process manager (PM2, systemd) for the API server
4. Serve the frontend as static files via Nginx or a CDN
5. Ensure Chromium is available (required by wppconnect/Puppeteer)

---

<a name="arabic-documentation"></a>
## توثيق باللغة العربية

### نظرة عامة

مدير واتساب هو منصة متكاملة مفتوحة المصدر لإدارة جلسات واتساب متعددة. تُتيح لك الاتصال بحسابات واتساب وإرسال واستقبال الرسائل برمجياً ومراقبة جميع الأنشطة من لوحة تحكم ثنائية اللغة.

### المميزات

- **إدارة جلسات متعددة** — ربط وإدارة عدة حسابات واتساب في آنٍ واحد
- **مسح QR في الوقت الفعلي** — ربط أجهزة جديدة عبر WebSocket مباشرةً من اللوحة
- **واجهة عربية/إنجليزية** — دعم RTL كامل مع خط Cairo للعربية وتبديل سلس بين اللغتين
- **الوضع الداكن/الفاتح** — تبديل ثيمات مع حفظ تفضيلات المستخدم
- **إرسال الرسائل** — نص وصور وفيديو وصوت ومستندات عبر الواجهة أو API
- **دعم Webhook** — إعادة توجيه الرسائل الواردة إلى n8n أو أي نظام خارجي
- **إدارة المستخدمين** — لوحة إدارة مع صلاحيات مدير وموظف
- **مفاتيح API** — إنشاء وإلغاء مفاتيح API للوصول البرمجي

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

| المتغير | مطلوب | الافتراضي | الوصف |
|---------|-------|-----------|-------|
| `DATABASE_URL` | ✅ | — | رابط اتصال PostgreSQL |
| `PORT` | ✅ | `8080` | منفذ خادم API |
| `JWT_SECRET` | ⚠️ | تلقائي | مفتاح JWT — **أضفه في الإنتاج!** |
| `ADMIN_PASSWORD` | ❌ | `admin123` | كلمة مرور حساب المدير الأولي |

**تشغيل بيئة التطوير (نافذتا طرفية):**

```bash
# الطرفية الأولى — خادم API
PORT=8080 pnpm --filter @workspace/api-server run dev

# الطرفية الثانية — لوحة التحكم
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-dashboard run dev
```

افتح `http://localhost:5000` — بيانات الدخول الافتراضية: `admin` / `admin123`.

> ⚠️ **غيّر كلمة المرور الافتراضية فوراً في بيئة الإنتاج.**

### صفحات لوحة التحكم

| الصفحة | المسار | الوصف |
|--------|--------|-------|
| تسجيل الدخول | `/login` | المصادقة بـ JWT |
| لوحة القيادة | `/` | بطاقات الملخص ومخطط حجم الرسائل |
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
  -d '{"username": "admin", "password": "admin123"}'

# إرسال رسالة نصية
curl -X POST http://localhost:8080/api/sessions/{id}/send/text \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"number": "966501234567", "text": "مرحباً!"}'
```

### أحداث WebSocket الفورية

اتصل عبر Socket.IO لاستقبال التحديثات الفورية:

| الحدث | البيانات | الوصف |
|-------|---------|-------|
| `qr` | `{ sessionId, qr }` | رمز QR للجلسة قيد الاتصال |
| `session_status` | `{ sessionId, status }` | تغيير حالة الجلسة |

### النشر للإنتاج

```bash
# بناء خادم API
pnpm --filter @workspace/api-server run build

# بناء لوحة التحكم (الناتج في artifacts/whatsapp-dashboard/dist/public/)
pnpm --filter @workspace/whatsapp-dashboard run build
```

قائمة التحقق للإنتاج:
1. تعيين `JWT_SECRET` لقيمة عشوائية قوية
2. تغيير كلمة مرور المدير الافتراضية بعد أول دخول
3. استخدام مدير عمليات (PM2 أو systemd) لخادم API
4. تقديم الواجهة الأمامية كملفات ثابتة عبر Nginx أو CDN
5. التأكد من توفر Chromium في بيئة التشغيل (مطلوب لـ wppconnect)

---

## Contributing / المساهمة

- Fork the repository and create a feature branch.
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) for RTL compatibility.
- All new UI strings must have both `en` and `ar` entries in `lib/i18n.ts`.
- Follow existing Shadcn UI component patterns.

---

## License / الرخصة

MIT License — free to use and modify for personal or commercial projects.

---

<div align="center">
  Built with TypeScript · React · Express · wppconnect
</div>
