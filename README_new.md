# 🛡️ منصة ProTeach للأتمتة الذكية

<div dir="rtl">

> بنية تحتية متكاملة لأتمتة سير العمل وإدارة واتساب على Google Cloud، مع حماية Cloudflare وشهادات SSL.

**المطور:** إبراهيم صيداوي &nbsp;|&nbsp; **آخر تحديث:** أبريل 2026

---

## 📋 جدول المحتويات

- [نظرة عامة](#-نظرة-عامة)
- [مواصفات السيرفر](#-مواصفات-السيرفر)
- [الخدمات والروابط](#-الخدمات-والروابط)
- [مخطط البنية التحتية](#-مخطط-البنية-التحتية)
- [متطلبات التشغيل](#-متطلبات-التشغيل)
- [طريقة التثبيت](#-طريقة-التثبيت)
- [إعداد Cloudflare](#-إعداد-cloudflare)
- [إعداد Nginx Proxy Manager](#-إعداد-nginx-proxy-manager)
- [نظام واتساب](#-نظام-واتساب)
- [النسخ الاحتياطي التلقائي](#-النسخ-الاحتياطي-التلقائي)
- [أوامر الإدارة اليومية](#-أوامر-الإدارة-اليومية)
- [استكشاف الأخطاء](#-استكشاف-الأخطاء)

---

## 🌟 نظرة عامة

هذا المشروع عبارة عن بنية تحتية متكاملة تجمع بين:

- **n8n** — منصة أتمتة سير العمل مفتوحة المصدر
- **WhatsApp Manager** — لوحة تحكم لإدارة جلسات واتساب متعددة مع API كامل
- **Portainer** — واجهة رسومية لإدارة Docker
- **Nginx Proxy Manager** — بروكسي عكسي مع دعم SSL تلقائي
- **PostgreSQL** — قاعدتا بيانات مستقلتان (لـ n8n والواتساب)

كل الخدمات تعمل داخل شبكة Docker مشتركة، محمية بـ Cloudflare وشهادات Let's Encrypt.

---

## 🖥️ مواصفات السيرفر

| المواصفة | التفاصيل |
|---|---|
| **المزود** | Google Cloud Platform |
| **النظام** | Ubuntu 24.04 LTS |
| **اسم السيرفر** | charity-server |
| **المعالج** | 2 vCPUs |
| **الذاكرة** | 8 GB RAM |
| **عنوان IP** | 34.179.180.10 |
| **ربط GitHub** | SSH Key |
| **SSL** | Cloudflare Full (Strict) |

---

## 🌐 الخدمات والروابط

| الخدمة | الرابط | المنفذ الداخلي | الحالة |
|---|---|---|---|
| **n8n** | [n8n.sidawin8n.cfd](https://n8n.sidawin8n.cfd) | 5678 | ✅ |
| **WhatsApp Dashboard** | [wa.sidawin8n.cfd](https://wa.sidawin8n.cfd) | 5000 | ✅ |
| **Portainer** | [admin.sidawin8n.cfd](https://admin.sidawin8n.cfd) | 9000 | ✅ |
| **Nginx Proxy Manager** | [proxy.sidawin8n.cfd](https://proxy.sidawin8n.cfd) | 81 | ✅ |

---

## 🏗️ مخطط البنية التحتية

```
                    ┌─────────────────────────┐
                    │   Cloudflare DNS + SSL  │
                    │      sidawin8n.cfd      │
                    └───────────┬─────────────┘
                                │ HTTPS :443
                    ┌───────────▼─────────────┐
                    │   Nginx Proxy Manager   │
                    │    proteach-npm :81     │
                    └──┬────────┬──────┬──────┘
                       │        │      │
           ┌───────────▼┐  ┌────▼───┐ ┌▼───────────────────┐
           │    n8n     │  │Portainer│ │  WhatsApp Stack    │
           │:5678       │  │ :9000  │ │                    │
           └─────┬──────┘  └────────┘ │  Dashboard  :5000  │
                 │                    │  API        :8080  │
         ┌───────▼──────┐             │  PostgreSQL  :5432 │
         │ PostgreSQL16 │             └────────────────────┘
         │  (n8n DB)    │                        │
         └──────────────┘             ┌──────────▼─────────┐
                                      │   PostgreSQL 15    │
                                      │  (WhatsApp DB)     │
                                      └────────────────────┘
```

---

## ⚙️ متطلبات التشغيل

- سيرفر Ubuntu 20.04+ أو أي توزيعة Linux حديثة
- Docker Engine مثبت
- Docker Compose V2
- نطاق (Domain) مربوط بـ Cloudflare
- مفتاح SSH مربوط بـ GitHub

### تثبيت Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🚀 طريقة التثبيت

### 1. استنساخ المستودع

```bash
git clone git@github.com:ibrahims78/proteach-n8n-setup.git
cd proteach-n8n-setup
```

### 2. استنساخ مشروع واتساب

```bash
git clone https://github.com/ibrahims78/WhatsApp-Bot whatsapp-manager
```

### 3. إعداد متغيرات البيئة

```bash
cp .env.example .env
nano .env
```

المتغيرات المطلوبة:

```env
# قاعدة بيانات n8n
N8N_DB_USER=n8n_user
N8N_DB_PASSWORD=كلمة_مرور_قوية

# قاعدة بيانات واتساب
WA_DB_USER=wauser
WA_DB_PASSWORD=كلمة_مرور_قوية

# مفتاح JWT لواتساب
JWT_SECRET=96_حرف_عشوائي   # openssl rand -hex 48

# نطاق واتساب للسماح له بالوصول
ALLOWED_ORIGINS=https://wa.sidawin8n.cfd
```

### 4. تشغيل جميع الخدمات

```bash
sudo docker compose up -d
```

### 5. التحقق من التشغيل

```bash
sudo docker ps
```

يجب أن ترى الحاويات التالية تعمل:
```
proteach-n8n         ✅
proteach-db          ✅
proteach-npm         ✅
proteach-portainer   ✅
proteach-wa-api      ✅
proteach-wa-dashboard ✅
proteach-wa-db       ✅
```

---

## ☁️ إعداد Cloudflare

أضف **A Record** لكل خدمة في لوحة Cloudflare:

| الاسم | النوع | القيمة | البروكسي |
|---|---|---|---|
| `n8n` | A | `34.179.180.10` | ✅ مفعّل |
| `wa` | A | `34.179.180.10` | ✅ مفعّل |
| `admin` | A | `34.179.180.10` | ✅ مفعّل |
| `proxy` | A | `34.179.180.10` | ✅ مفعّل |

> **ملاحظة:** تأكد من أن وضع SSL في Cloudflare على **Full (Strict)** لتجنب حلقات إعادة التوجيه.

---

## 🔀 إعداد Nginx Proxy Manager

للوصول للوحة NPM: `https://proxy.sidawin8n.cfd`

أنشئ **Proxy Host** لكل خدمة:

| النطاق | Forward Hostname | Forward Port | SSL |
|---|---|---|---|
| `n8n.sidawin8n.cfd` | `proteach-n8n` | `5678` | Let's Encrypt |
| `wa.sidawin8n.cfd` | `proteach-wa-dashboard` | `5000` | Let's Encrypt |
| `admin.sidawin8n.cfd` | `proteach-portainer` | `9000` | Let's Encrypt |
| `proxy.sidawin8n.cfd` | `localhost` | `81` | Let's Encrypt |

> ⚠️ **مهم جداً:** استخدم **اسم الحاوية** دائماً كـ Forward Hostname وليس عنوان IP. عنوان IP يتغير عند إعادة تشغيل الحاوية مما يسبب خطأ 502.

---

## 🤖 نظام واتساب

### أول دخول

| الحقل | القيمة |
|---|---|
| المستخدم | `admin` |
| كلمة المرور | `123456` |

> ⚠️ **غيّر كلمة المرور فور تسجيل الدخول الأول.**

### ربط جلسة واتساب

1. ادخل على `https://wa.sidawin8n.cfd`
2. سجّل الدخول بحسابك
3. اضغط **جلسة جديدة**
4. امسح رمز QR من تطبيق واتساب على هاتفك
5. الجلسة أصبحت نشطة وجاهزة للاستخدام مع n8n

### ربط واتساب مع n8n

**إرسال رسالة:**
```http
POST https://wa.sidawin8n.cfd/api/sessions/{sessionId}/send-message
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "to": "966500000000@c.us",
  "message": "مرحباً من n8n!"
}
```

**استعراض جميع الجلسات:**
```http
GET https://wa.sidawin8n.cfd/api/sessions
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 💾 النسخ الاحتياطي التلقائي

تم إعداد نسخ احتياطي يومي تلقائي يعمل كل يوم الساعة **3:00 صباحاً** ويرفع النتيجة تلقائياً إلى GitHub.

### ما يشمله النسخ الاحتياطي

- ✅ إعدادات n8n ومساراتها (`n8n_data/`)
- ✅ بيانات جلسات واتساب (`wa_tokens/`)
- ✅ الملفات العامة (`wa_public/`)
- ✅ قاعدة بيانات واتساب (`wa_postgres_data/`)
- ✅ ملف `docker-compose.yaml`
- ❌ `node_modules` (مستبعدة لتوفير المساحة)

### تشغيل النسخ الاحتياطي يدوياً

```bash
cd ~/proteach-n8n
bash backup.sh
```

### مراجعة سجل النسخ الاحتياطي

```bash
cat ~/proteach-n8n/backup.log
```

### التحقق من الجدولة التلقائية

```bash
crontab -l
# يجب أن ترى:
# 0 3 * * * /bin/bash /home/ibrahimsidawi/proteach-n8n/backup.sh >> ...
```

---

## 🔧 أوامر الإدارة اليومية

### عرض الحاويات النشطة

```bash
sudo docker ps
```

### مشاهدة سجلات خدمة معينة

```bash
# واتساب API
sudo docker logs proteach-wa-api --tail 50 -f

# واتساب Dashboard
sudo docker logs proteach-wa-dashboard --tail 50

# n8n
sudo docker logs proteach-n8n --tail 50
```

### إعادة تشغيل خدمة

```bash
sudo docker restart proteach-wa-api
```

### إيقاف كل الخدمات

```bash
sudo docker compose down
```

### تحديث وإعادة البناء

```bash
git pull
sudo docker compose down
sudo docker compose up -d --build
```

### رفع التعديلات لـ GitHub

```bash
git add .
git commit -m "تحديث الإعدادات"
git push origin master
```

---

## 🐛 استكشاف الأخطاء

### خطأ 502 Bad Gateway

**السبب:** NPM يستخدم IP قديم للحاوية بعد إعادة التشغيل.

**الحل:** عدّل الـ Proxy Host في NPM وتأكد أن Forward Hostname هو **اسم الحاوية** وليس IP.

---

### خطأ CORS عند تسجيل الدخول

**السبب:** نطاقك غير مسموح له في إعدادات الـ API.

**الحل:**
```bash
# أضف نطاقك لملف .env
echo "ALLOWED_ORIGINS=https://wa.sidawin8n.cfd" >> .env

# أعد تشغيل الـ API
sudo docker restart proteach-wa-api
```

---

### انقطاع جلسة واتساب

الجلسات تُحفظ تلقائياً وتستعيد اتصالها بعد إعادة التشغيل. إذا ظلت منقطعة، ادخل للوحة التحكم وامسح رمز QR من جديد.

---

### فشل رفع النسخة الاحتياطية لـ GitHub

```bash
# تحقق من إعداد SSH
ssh -T git@github.com

# إصلاح صلاحيات Git
sudo chown -R ibrahimsidawi:ibrahimsidawi ~/proteach-n8n/.git
```

---

## 🗂️ هيكل المشروع

```
proteach-n8n-setup/
├── docker-compose.yaml          # ملف تعريف جميع الخدمات
├── backup.sh                    # سكربت النسخ الاحتياطي التلقائي
├── .env.example                 # نموذج متغيرات البيئة
├── .gitignore                   # الملفات المستبعدة من Git
├── Automation_And_Backup_Guide.md  # دليل الأتمتة والنسخ الاحتياطي
├── whatsapp-manager/            # (مُستنسخ منفصلاً - WhatsApp-Bot)
│   ├── artifacts/
│   │   ├── api-server/          # خادم API (Express + WPPConnect)
│   │   └── whatsapp-dashboard/  # لوحة التحكم (React + Vite)
│   └── lib/
│       ├── db/                  # Drizzle ORM
│       └── api-zod/             # مخططات التحقق المشتركة
├── n8n_data/                    # بيانات n8n (مُستبعدة من Git)
├── wa_tokens/                   # توكنات واتساب (مُستبعدة من Git)
└── wa_postgres_data/            # قاعدة بيانات واتساب (مُستبعدة من Git)
```

---

## 🔗 المستودعات المرتبطة

| المستودع | الوصف |
|---|---|
| [proteach-n8n-setup](https://github.com/ibrahims78/proteach-n8n-setup) | هذا المستودع — إعدادات البنية التحتية |
| [WhatsApp-Bot](https://github.com/ibrahims78/WhatsApp-Bot) | كود نظام واتساب (API + Dashboard) |

---

## 📄 الرخصة

MIT — مفتوح للاستخدام الشخصي والتجاري.

---

<div align="center">
  تم التطوير بواسطة <strong>إبراهيم صيداوي</strong>
</div>

</div>
