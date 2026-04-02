# دليل إعداد Cloudflare و Nginx Proxy Manager
## WhatsApp Manager على VPS ProTeach

---

## 1. إعداد Cloudflare (DNS)

### أضف A Record جديد للواتساب:

| الحقل              | القيمة              |
|--------------------|---------------------|
| Type               | A                   |
| Name               | `wa`                |
| IPv4 Address       | `34.179.180.10`     |
| Proxy Status       | ✅ مفعّل (برتقالي) |
| TTL                | Auto                |

سيصبح الرابط النهائي: **https://wa.sidawin8n.cfd**

### إعدادات SSL/TLS في Cloudflare:
- تأكد أن الوضع مضبوط على: **Full (Strict)**
- المسار: SSL/TLS → Overview → Full (Strict)

---

## 2. إعداد Nginx Proxy Manager

افتح: **https://proxy.sidawin8n.cfd** → Proxy Hosts → Add Proxy Host

### تبويب Details:

| الحقل                   | القيمة           |
|-------------------------|------------------|
| Domain Names            | `wa.sidawin8n.cfd` |
| Scheme                  | `http`           |
| Forward Hostname / IP   | `wa-dashboard`   |
| Forward Port            | `5000`           |
| Cache Assets            | ❌ معطّل         |
| Block Common Exploits   | ✅ مفعّل         |
| Websockets Support      | ✅ مفعّل (مهم لـ Socket.IO) |

> ملاحظة: نستخدم اسم الخدمة `wa-dashboard` وليس IP لأنها ضمن نفس شبكة `n8n-network`.
> المنفذ `5000` هو المنفذ الداخلي للحاوية، وليس 5005 (ذلك للوصول المباشر من السيرفر فقط).

### تبويب SSL:

| الخيار                 | القيمة                         |
|------------------------|--------------------------------|
| SSL Certificate        | Request a new SSL Certificate  |
| Force SSL              | ✅ مفعّل                       |
| HTTP/2 Support         | ✅ مفعّل                       |
| HSTS Enabled           | ✅ مفعّل (اختياري)             |
| I Agree to Terms       | ✅                              |

اضغط **Save** وانتظر 30 ثانية حتى يُولَّد الشهادة.

---

## 3. التحقق من عمل الرابط

بعد الإعداد، تحقق من:

```bash
# من VPS - اختبار مباشر للحاوية
curl -s http://localhost:5005 | head -5

# اختبار API داخل الشبكة
curl -s http://localhost:8080/ || docker exec proteach-wa-api curl -s http://localhost:8080/

# اختبار الرابط العام (بعد DNS يستقر خلال 1-5 دقائق)
curl -I https://wa.sidawin8n.cfd
```

---

## 4. أوامر تشغيل الخدمات الجديدة على VPS

```bash
# الخطوة 1: الانتقال إلى مجلد المشروع
cd ~/proteach-n8n

# الخطوة 2: استنساخ مشروع WhatsApp من GitHub
git clone https://github.com/ibrahims78/WhatsApp-Bot whatsapp-manager

# الخطوة 3: ضع ملف docker-compose.yaml المُعدَّل
# (حمّله من Replit وارفعه عبر scp أو انسخ محتواه)

# الخطوة 4: بناء وتشغيل خدمات WhatsApp فقط
sudo docker-compose up -d --build wa-db wa-api wa-dashboard

# متابعة logs الـ API للتحقق
sudo docker logs proteach-wa-api -f

# متابعة logs الـ Dashboard
sudo docker logs proteach-wa-dashboard -f

# التحقق من حالة الحاويات
sudo docker ps | grep proteach-wa
```

---

## 5. معلومات الدخول

| الخدمة              | الرابط                         | المستخدم | كلمة المرور |
|---------------------|--------------------------------|----------|-------------|
| WhatsApp Dashboard  | https://wa.sidawin8n.cfd       | admin    | 123456 (غيّرها فور الدخول) |
| Portainer           | https://admin.sidawin8n.cfd    | admin    | @VMware2@VMware2 |
| n8n                 | https://n8n.sidawin8n.cfd      | ibrahimsidawi@gmail.com | @VMware2 |
| Nginx Proxy Manager | https://proxy.sidawin8n.cfd    | ibrahimsidawi@gmail.com | @VMware2 |

---

## 6. تكامل WhatsApp مع n8n

بما أن كلا المشروعين على نفس شبكة `n8n-network`، يمكن استدعاء API الواتساب من داخل n8n:

### Webhook لاستقبال الرسائل في n8n:
- أضف Webhook trigger في n8n
- URL الـ webhook: سيكون متاحاً من إعدادات الجلسة في Dashboard

### إرسال رسالة واتساب من n8n (HTTP Request Node):
```
Method: POST
URL: http://wa-api:8080/api/send/text
Headers:
  Content-Type: application/json
  X-API-Key: (مفتاح API من لوحة التحكم)
Body:
  {
    "sessionId": "اسم_الجلسة",
    "to": "966xxxxxxxxx@c.us",
    "text": "نص الرسالة"
  }
```

---

## 7. ملاحظات مهمة

- **جلسات WhatsApp** تُحفظ في `./wa_tokens/` — لا تحذفها عند إعادة البناء
- **المنفذ 5005** مكشوف على السيرفر للوصول المباشر (`http://34.179.180.10:5005`)
- NPM يصل للـ Dashboard عبر المنفذ الداخلي 5000 (ليس 5005)
- أول تسجيل دخول: `admin` / `123456` — **غيّر كلمة المرور فوراً**
- لتحديث الكود لاحقاً:
  ```bash
  cd ~/proteach-n8n/whatsapp-manager
  git pull origin main
  cd ..
  sudo docker-compose up -d --build wa-api wa-dashboard
  ```
