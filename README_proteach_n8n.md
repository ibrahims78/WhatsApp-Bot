# 🚀 ProTeach n8n Stack — Full VPS Setup

A production-ready self-hosted automation stack built on Google Cloud, combining **n8n**, **WhatsApp Manager**, **Portainer**, and **Nginx Proxy Manager** — all secured with Cloudflare SSL.

---

## 🌐 Live Services

| Service | URL | Description |
|---|---|---|
| **WhatsApp Manager** | `https://wa.yourdomain.com` | Multi-session WhatsApp dashboard |
| **n8n** | `https://n8n.yourdomain.com` | Workflow automation engine |
| **Portainer** | `https://admin.yourdomain.com` | Docker container management |
| **Proxy Manager** | `https://proxy.yourdomain.com` | Nginx reverse proxy & SSL |

---

## 📦 Stack Overview

```
┌─────────────────────────────────────────────┐
│              Cloudflare (DNS + SSL)         │
└────────────────────┬────────────────────────┘
                     │ HTTPS (443)
┌────────────────────▼────────────────────────┐
│         Nginx Proxy Manager (NPM)           │
│    Routes traffic to internal containers    │
└──┬──────────────┬──────────────┬────────────┘
   │              │              │
┌──▼───┐    ┌────▼────┐   ┌────▼──────────────┐
│ n8n  │    │Portainer│   │  WhatsApp Stack   │
│:5678 │    │  :9000  │   │  Dashboard :5000  │
└──┬───┘    └─────────┘   │  API       :8080  │
   │                      │  DB (PG15) :5432  │
┌──▼──────┐               └───────────────────┘
│ PostgreSQL│
│  (n8n DB) │
└───────────┘
```

---

## ⚙️ Prerequisites

- Google Cloud VM (Ubuntu 22.04+ recommended)
- Domain name with Cloudflare DNS
- Docker + Docker Compose installed

### Install Docker on Ubuntu

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/ibrahims78/proteach-n8n-setup.git
cd proteach-n8n-setup
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in the required values:

```env
# Database
POSTGRES_USER=wauser
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=whatsapp_manager_db

# Security
JWT_SECRET=your_jwt_secret_64chars   # openssl rand -hex 48

# App
APP_PORT=5005

# CORS — your public WhatsApp dashboard domain
ALLOWED_ORIGINS=https://wa.yourdomain.com
```

### 3. Start all services

```bash
sudo docker compose up -d
```

---

## 🔐 Cloudflare Setup

For each service, add an **A Record** in Cloudflare:

| Name | Type | Value | Proxy |
|---|---|---|---|
| `n8n` | A | `YOUR_SERVER_IP` | ✅ On |
| `wa` | A | `YOUR_SERVER_IP` | ✅ On |
| `admin` | A | `YOUR_SERVER_IP` | ✅ On |
| `proxy` | A | `YOUR_SERVER_IP` | ✅ On |

---

## 🔀 Nginx Proxy Manager Setup

For each service, create a **Proxy Host** in NPM:

| Domain | Forward Hostname | Forward Port |
|---|---|---|
| `n8n.yourdomain.com` | `proteach-n8n` | `5678` |
| `wa.yourdomain.com` | `proteach-wa-dashboard` | `5000` |
| `admin.yourdomain.com` | `proteach-portainer` | `9000` |
| `proxy.yourdomain.com` | `localhost` | `81` |

> ⚠️ **Important:** Always use the **container name** (not IP address) as the Forward Hostname. This ensures routing works correctly even after container restarts.

Enable **SSL → Let's Encrypt** for each host.

---

## 🤖 WhatsApp Manager

The WhatsApp Manager is a full-stack application for managing multiple WhatsApp sessions:

- **Dashboard:** React 18 + Vite + TailwindCSS (Arabic/English RTL support)
- **API:** Express 5 + WPPConnect + Socket.IO
- **Database:** PostgreSQL 15

### Default Login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `123456` |

> ⚠️ Change your password immediately after first login.

### Connecting a WhatsApp Session

1. Go to `https://wa.yourdomain.com`
2. Login with your credentials
3. Click **New Session**
4. Scan the QR code with your WhatsApp mobile app
5. Session is now active and ready for n8n integration

---

## 🔗 Integrating with n8n

Once a WhatsApp session is active, use the API from n8n workflows:

**Send a message:**
```
POST https://wa.yourdomain.com/api/sessions/{sessionId}/send-message
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "to": "966500000000@c.us",
  "message": "Hello from n8n!"
}
```

**Get all sessions:**
```
GET https://wa.yourdomain.com/api/sessions
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🔄 Daily Operations

### View running containers
```bash
sudo docker ps
```

### View logs
```bash
# WhatsApp API
sudo docker logs proteach-wa-api --tail 50

# WhatsApp Dashboard
sudo docker logs proteach-wa-dashboard --tail 50

# n8n
sudo docker logs proteach-n8n --tail 50
```

### Restart a specific service
```bash
sudo docker restart proteach-wa-api
```

### Stop all services
```bash
sudo docker compose down
```

### Update and rebuild
```bash
git pull
sudo docker compose down
sudo docker compose up -d --build
```

---

## 🗂️ Project Structure

```
proteach-n8n-setup/
├── docker-compose.yml          # Production stack
├── docker-compose.dev.yml      # Development stack (with HMR)
├── .env.example                # Environment variables template
├── artifacts/
│   ├── api-server/             # Express API (WhatsApp backend)
│   └── whatsapp-dashboard/     # React dashboard (frontend)
├── lib/
│   ├── db/                     # Drizzle ORM schema
│   ├── api-zod/                # Shared Zod validation schemas
│   └── api-client-react/       # Generated React hooks
└── entrypoint.sh               # Container startup script
```

---

## 🛡️ Security Notes

- JWT secrets are generated automatically on first setup
- All traffic is encrypted via Cloudflare SSL (Let's Encrypt)
- The WhatsApp API is **not** exposed directly to the internet — only accessible through the dashboard proxy
- Rate limiting is applied to all API endpoints
- Change the default admin password immediately after first login

---

## 🐛 Troubleshooting

### 502 Bad Gateway
NPM is using an old IP for the container. Edit the Proxy Host and set the Forward Hostname to the **container name** (not an IP address).

### CORS Error on Login
Add your domain to the API environment:
```bash
echo "ALLOWED_ORIGINS=https://wa.yourdomain.com" >> .env
sudo docker restart proteach-wa-api
```

### WhatsApp session disconnects
Sessions persist across API restarts automatically. If a session shows as disconnected, go to the dashboard and reconnect by scanning the QR code again.

---

## 📄 License

MIT — Free for personal and commercial use.

---

## 👤 Author

**Ibrahim Al-Sidawi**
- GitHub: [@ibrahims78](https://github.com/ibrahims78)
