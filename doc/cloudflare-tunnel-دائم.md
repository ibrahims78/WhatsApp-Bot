# إعداد Cloudflare Tunnel دائم لنطاقك الخاص

## المتطلبات
- حساب Cloudflare مجاني: https://dash.cloudflare.com
- نطاق (Domain) مضاف إلى Cloudflare وDNS مدار من خلاله
- cloudflared مثبت على الجهاز: `C:\Program Files (x86)\cloudflared\cloudflared.exe`

---

## الخطوة 1 — تسجيل الدخول

افتح CMD كـ Administrator وشغّل:

```cmd
"C:\Program Files (x86)\cloudflared\cloudflared.exe" login
```

سيفتح المتصفح تلقائياً → اختر نطاقك من القائمة → اضغط Authorize.

بعد النجاح سيُنشئ ملف `cert.pem` في:
```
C:\Users\admin\.cloudflared\cert.pem
```

---

## الخطوة 2 — إنشاء tunnel

```cmd
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel create whatsapp-api
```

سيعطيك:
```
Created tunnel whatsapp-api with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

احتفظ بالـ **ID** هذا — ستحتاجه لاحقاً.

---

## الخطوة 3 — ربط النطاق بالـ Tunnel

```cmd
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel route dns whatsapp-api api.yourdomain.com
```

استبدل `api.yourdomain.com` بالنطاق الفرعي الذي تريده.

سيُضيف Cloudflare سجل CNAME تلقائياً.

---

## الخطوة 4 — إنشاء ملف الإعداد

أنشئ المجلد إذا لم يكن موجوداً:
```cmd
mkdir "C:\Users\admin\.cloudflared"
```

أنشئ ملف `config.yml` في `C:\Users\admin\.cloudflared\`:

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: C:\Users\admin\.cloudflared\xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:5005
  - service: http_status:404
```

استبدل:
- `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` بالـ ID من الخطوة 2
- `api.yourdomain.com` بنطاقك الفرعي

---

## الخطوة 5 — تثبيت كـ Windows Service

```cmd
"C:\Program Files (x86)\cloudflared\cloudflared.exe" service install
```

ثم ابدأ الخدمة:
```cmd
sc start cloudflared
```

---

## الخطوة 6 — التحقق من التشغيل

```cmd
sc query cloudflared
```

يجب أن يظهر `STATE: 4 RUNNING`.

---

## الخطوة 7 — تحديث n8n

في الـ workflow غيّر الـ URL إلى:
```
https://api.yourdomain.com/api/sessions/{{ $json.sessionId }}/send/text
```

---

## ملاحظات مهمة

- الـ Tunnel الدائم يعمل تلقائياً عند تشغيل Windows (لأنه Service).
- لا يتغير الرابط مطلقاً.
- إذا كان cloudflared مثبتاً بالفعل كـ Service، قد تحتاج إلى إلغاء تثبيته أولاً ثم إعادة التثبيت:
  ```cmd
  sc stop cloudflared
  "C:\Program Files (x86)\cloudflared\cloudflared.exe" service uninstall
  ```
  ثم كرر الخطوة 5.
