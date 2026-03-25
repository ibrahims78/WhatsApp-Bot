# دليل ورك فلو n8n لواتساب — شرح كامل

## ما هو هذا الورك فلو؟

هذا ورك فلو جاهز لـ **n8n** يربط نظام **WhatsApp Manager** بأتمتة متكاملة.  
يستقبل **جميع** أنواع رسائل الواتساب ويردّ عليها بالنوع المناسب تلقائياً، مع وضع **Echo للاختبار** وتسجيل الأخطاء.

---

## مخطط التدفق الكامل

```
📥 Receive WhatsApp Message
        │
        ├──▶ ✅ Respond 200 OK
        │
        └──▶ 🔍 Extract Message Fields
                    │
                    ▼
            🔀 Route by Message Type (استقبال)
   ┌──┬──┬──┬──┬──┬───┬──────┐
   ▼  ▼  ▼  ▼  ▼  ▼   ▼
  Txt Img Vid Aud Doc Stk  Loc
   │  │  │  │  │  │   │
   └──┴──┴──┴──┴──┴───┘
                │
                ▼
        🔗 Merge All Replies
                │
                ▼
        ⏱️ Wait 2 Seconds
                │
                ▼
        🔀 Route by Reply Type (إرسال)
   ┌──┬──┬──┬──┬──┬───┬──────┐
   ▼  ▼  ▼  ▼  ▼  ▼   ▼
  📤  🖼️  🎬  🎵  📄  🎯  📍
  Txt Img Vid Aud Doc Stk Loc
   │  │  │  │  │  │   │
   └──┴──error──┴──┴───┘
                │
                ▼
        ⚠️ Log Send Error
```

---

## العقد وما تفعله

### جانب الاستقبال

| العقدة | المهمة |
|--------|--------|
| 📥 Receive WhatsApp Message | يستقبل الرسائل الواردة عبر Webhook POST |
| ✅ Respond 200 OK | يُقرّ الاستلام فوراً لمنع إعادة المحاولة |
| 🔍 Extract Message Fields | يُعالج الـ payload ويستخرج الحقول (بما فيها lat/lng) |
| 🔀 Route by Message Type | يوجّه حسب نوع الرسالة الواردة (7 مسارات) |
| 💬 Handle Text | يعالج النصوص + **وضع Echo للاختبار** |
| 🖼️ Handle Image | يعالج الصور الواردة |
| 🎬 Handle Video | يعالج الفيديو الوارد |
| 🎵 Handle Audio / Voice | يعالج الصوت والرسائل الصوتية |
| 📄 Handle Document | يعالج المستندات (PDF, DOCX, ZIP...) |
| 🎯 Handle Sticker | **جديد** — يعالج الملصقات الواردة |
| 📍 Handle Location | **جديد** — يعالج المواقع الجغرافية + رابط Google Maps |
| 🔗 Merge All Replies | يجمع مخرجات جميع المعالجات |
| ⏱️ Wait 2 Seconds | تأخير 2 ثانية لتجنب الحظر من واتساب |

### جانب الإرسال

| العقدة | ما ترسله | الحقول المطلوبة |
|--------|---------|-----------------|
| 🔀 Route by Reply Type | يوجّه حسب `replyType` | — |
| 📤 Send Text Reply | رسالة نصية | `replyText` |
| 🖼️ Send Image Reply | صورة | `replyImageUrl` + `replyCaption` (اختياري) |
| 🎬 Send Video Reply | **جديد** — فيديو حقيقي | `replyVideoUrl` + `replyCaption` (اختياري) |
| 🎵 Send Audio Reply | ملف صوتي | `replyAudioUrl` |
| 📄 Send Document Reply | مستند/ملف | `replyFileUrl` + `replyFileName` + `replyCaption` (اختياري) |
| 🎯 Send Sticker Reply | **جديد** — ملصق | `replyImageUrl` (PNG/JPG/WebP → يُحوَّل تلقائياً) |
| 📍 Send Location Reply | **جديد** — موقع جغرافي | `replyLat` + `replyLng` + `replyLocationDesc` (اختياري) |
| ⚠️ Log Send Error | **جديد** — يسجّل أخطاء الإرسال | يتصل بكل عقد الإرسال عبر error output |

---

## 🧪 وضع Echo للاختبار

أرسل رسالة تبدأ بـ `صدى` أو `echo` على واتساب لاختبار الاتصال:

| ترسل | يردّ البوت |
|------|-----------|
| `صدى مرحبا` | `🔁 صدى: مرحبا` |
| `echo hello world` | `🔁 Echo: hello world` |
| `صدى` (فارغة) | `🔁 صدى: (رسالة فارغة)` |

مفيد للتحقق من أن الـ Webhook يصل والرد يُرسَل بنجاح.

---

## كيف تغيّر نوع الرد؟

في كل عقدة Handle، حدّد `replyType` بالقيمة المناسبة وأضف الحقل المطلوب:

### الرد بصورة
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'image',
  replyImageUrl: 'https://example.com/photo.jpg',
  replyCaption: 'إليك الصورة!'
};
```

### الرد بفيديو
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'video',
  replyVideoUrl: 'https://example.com/video.mp4',
  replyCaption: 'شاهد هذا الفيديو!'
};
```

### الرد بملف صوتي
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'audio',
  replyAudioUrl: 'https://example.com/audio.mp3'
};
```

### الرد بمستند
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'document',
  replyFileUrl: 'https://example.com/file.pdf',
  replyFileName: 'document.pdf',
  replyCaption: 'إليك الملف المطلوب'
};
```

### الرد بملصق
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'sticker',
  replyImageUrl: 'https://example.com/image.png'
  // يُحوَّل تلقائياً إلى ملصق واتساب
};
```

### الرد بموقع جغرافي
```javascript
return {
  sessionId, phoneNumber: phone,
  replyType: 'location',
  replyLat: 24.7136,
  replyLng: 46.6753,
  replyLocationDesc: 'الرياض — المملكة العربية السعودية'
};
```

---

## الإعدادات المطلوبة بعد الاستيراد

### 1. رابط Webhook

بعد استيراد الورك فلو في n8n وتفعيله، افتح عقدة **📥 Receive WhatsApp Message** وانسخ رابط الـ Webhook.  
ثم اذهب إلى **إعدادات الجلسة** في لوحة التحكم والصق الرابط في حقل **Webhook URL**.

### 2. مفتاح API (Credential)

في أي عقدة إرسال، أضف credential من نوع **HTTP Header Auth**:
- **Name**: `X-API-Key`
- **Value**: مفتاح الـ API من صفحة **مفاتيح API** في لوحة التحكم

> الملف المُحمَّل يحتوي على رابط خادمك محقوناً تلقائياً. تأكد فقط من إضافة الـ credential.

---

## كيفية الاستيراد في n8n

1. اذهب إلى n8n → قائمة **Workflows**
2. اضغط **Import from file**
3. اختر الملف `n8n-workflow-whatsapp.json`
4. أضف الـ credential (مفتاح API) كما هو موضح أعلاه
5. فعّل الورك فلو من زر التفعيل في أعلى اليمين
6. انسخ رابط الـ Webhook والصقه في إعدادات الجلسة
7. **اختبر**: أرسل `صدى مرحبا` على واتساب وتحقق من الرد

---

## جدول أنواع الرسائل المدعومة

| النوع | القيمة | الاستقبال | الإرسال |
|-------|--------|-----------|---------|
| نص | `chat` | ✅ + Echo | ✅ (`replyType: 'text'`) |
| صورة | `image` | ✅ | ✅ (`replyType: 'image'`) |
| فيديو | `video` | ✅ | ✅ (`replyType: 'video'`) |
| صوت / رسالة صوتية | `audio` / `ptt` | ✅ | ✅ (`replyType: 'audio'`) |
| مستند | `document` | ✅ | ✅ (`replyType: 'document'`) |
| ملصق | `sticker` | ✅ | ✅ (`replyType: 'sticker'`) |
| موقع | `location` | ✅ + Google Maps | ✅ (`replyType: 'location'`) |

---

## payload الرسائل الواردة

```json
{
  "event": "message.received",
  "sessionId": "session_abc123",
  "data": {
    "type": "chat",
    "from": "966501234567@c.us",
    "to": "966509876543@c.us",
    "body": "صدى مرحبا",
    "timestamp": 1706000000,
    "mediaUrl": null,
    "fileName": null,
    "caption": null,
    "mimetype": null,
    "lat": null,
    "lng": null,
    "loc": null
  }
}
```

| الحقل | الوصف |
|-------|-------|
| `event` | دائماً `"message.received"` |
| `sessionId` | معرّف الجلسة التي استقبلت الرسالة |
| `data.type` | نوع الرسالة: `chat` / `image` / `video` / `audio` / `ptt` / `document` / `sticker` / `location` |
| `data.from` | رقم المُرسِل بصيغة `966501234567@c.us` |
| `data.body` | نص الرسالة (فارغ للوسائط) |
| `data.mediaUrl` | رابط الوسائط إن وُجدت |
| `data.fileName` | اسم الملف للمستندات |
| `data.caption` | تعليق الوسائط |
| `data.mimetype` | نوع الملف (مثل `image/jpeg`) |
| `data.lat` | خط العرض (للمواقع فقط) |
| `data.lng` | خط الطول (للمواقع فقط) |
| `data.loc` | وصف الموقع (للمواقع فقط) |

---

## ملاحظات مهمة

- **عقدة Wait**: التأخير 2 ثانية يُقلّل من خطر حظر رقمك من واتساب.
- **Respond 200 OK**: يجب أن يكون أول رد للخادم، وإلا سيُعيد الخادم إرسال الرسالة.
- **⚠️ Log Send Error**: تتصل بجميع عقد الإرسال عبر error output — أي فشل في الإرسال يُسجَّل تلقائياً.
- **وضع Echo**: مثالي لاختبار الربط بدون الحاجة لكتابة منطق مخصص.
- **الملصقات**: أي صورة PNG/JPG/WebP تُحوَّل تلقائياً عبر الـ API.
- كل جلسة واتساب لها Webhook منفصل يمكنك توجيهها لورك فلوهات مختلفة.
