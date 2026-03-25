# دليل ورك فلو n8n لواتساب — شرح كامل

## ما هو هذا الورك فلو؟

هذا ورك فلو جاهز لـ **n8n** يربط نظام **WhatsApp Manager** بأتمتة متكاملة.  
بعد استيراده في n8n واحدة، سيصبح الذكاء الاصطناعي يستقبل كل رسائل الواتساب الواردة ويردّ عليها تلقائياً وفق نوعها.

---

## العقد (Nodes) وما تفعله

```
📥 Receive WhatsApp Message
        │
        ├──▶ ✅ Respond 200 OK          (يُرسل رد فوري للخادم)
        │
        └──▶ 🔍 Extract Message Fields  (يستخرج بيانات الرسالة)
                    │
                    ▼
            🔀 Route by Message Type
            ┌────┬────┬────┬────┬────────┐
            ▼    ▼    ▼    ▼    ▼        ▼
          Text Image Video Audio Document Other
            │    │    │    │    │
            └────┴────┴────┴────┘
                    │
                    ▼
            🔗 Merge All Replies
                    │
                    ▼
            ⏱️ Wait 2 Seconds
                    │
                    ▼
            📤 Send Text Reply
```

### تفاصيل كل عقدة

| العقدة | النوع | المهمة |
|--------|-------|---------|
| 📥 Receive WhatsApp Message | Webhook | يستقبل الرسائل من الخادم عبر POST |
| ✅ Respond 200 OK | Respond to Webhook | يُقرّ الاستلام فوراً لمنع إعادة المحاولة |
| 🔍 Extract Message Fields | Code | يُعالج الـ payload ويصنّف نوع الرسالة |
| 🔀 Route by Message Type | Switch | يوجّه التدفق حسب النوع: نص/صورة/فيديو/صوت/مستند |
| 💬 Handle Text | Code | يردّ على الرسائل النصية بكلمات مفتاحية |
| 🖼️ Handle Image | Code | يُقرّ استلام الصور |
| 🎬 Handle Video | Code | يُقرّ استلام الفيديو |
| 🎵 Handle Audio / Voice | Code | يُقرّ استلام الصوت والرسائل الصوتية |
| 📄 Handle Document | Code | يُقرّ استلام المستندات (PDF، DOCX، ...) |
| 🔗 Merge All Replies | Code | يجمع مخرجات كل المعالجات |
| ⏱️ Wait 2 Seconds | Wait | تأخير 2 ثانية لتجنب الحظر من واتساب |
| 📤 Send Text Reply | HTTP Request | يُرسل الرد عبر API الخادم |

---

## الإعدادات المطلوبة بعد الاستيراد

### 1. رابط Webhook

بعد استيراد الورك فلو في n8n، افتح عقدة **📥 Receive WhatsApp Message** وانسخ رابط الـ Webhook الذي يُولّده n8n.  
ثم اذهب إلى **إعدادات الجلسة** في لوحة التحكم والصق الرابط في حقل **Webhook URL**.

### 2. مفتاح API (Credential)

في عقدة **📤 Send Text Reply**، هناك credential باسم **"WhatsApp Manager API Key"**.  
اذهب إلى n8n → Credentials → New Credential → HTTP Header Auth:
- **Name**: `X-API-Key`
- **Value**: مفتاح الـ API الذي تحصل عليه من صفحة **مفاتيح API** في لوحة التحكم

### 3. رابط الخادم

في ملف الورك فلو المُحمَّل، يتم حقن رابط خادمك تلقائياً. تأكد أن الرابط صحيح في عقدة:
- 📤 Send Text Reply
- 🖼️ Send Image *(إن استخدمتها)*
- 📄 Send Document *(إن استخدمتها)*

---

## كيفية الاستيراد في n8n

1. افتح n8n → قائمة Workflows
2. اضغط على **Import from file**
3. اختر الملف `n8n-workflow-whatsapp.json`
4. بعد الاستيراد أعد إعداد الـ credential كما شُرح أعلاه
5. فعّل الورك فلو من زر التفعيل في أعلى اليمين

---

## منطق الردود التلقائية (Handle Text)

الكود الموجود يدعم الردود الآتية:

| الكلمات المفتاحية | الرد |
|-------------------|------|
| مرحبا / هلا / hello / hi | رد ترحيب |
| سعر / price / كم | إحالة لفريق المبيعات |
| وقت / دوام / hours / time | أوقات العمل |
| أي كلمة أخرى | رد افتراضي |

يمكنك تخصيص هذا الكود بالكامل من عقدة **💬 Handle Text**.

---

## أنواع الرسائل المدعومة

| النوع | القيمة في واتساب |
|-------|-----------------|
| نص | `chat` |
| صورة | `image` |
| فيديو | `video` |
| صوت / رسالة صوتية | `audio` / `ptt` |
| مستند | `document` |
| ملصق | `sticker` |
| موقع | `location` |

---

## payload الرسائل الواردة

هذا هو الشكل الحقيقي الذي يُرسله الخادم لـ n8n عند كل رسالة واردة:

```json
{
  "event": "message.received",
  "sessionId": "session_abc123",
  "data": {
    "type": "chat",
    "from": "966501234567@c.us",
    "to": "966509876543@c.us",
    "body": "مرحبا",
    "timestamp": 1706000000,
    "mediaUrl": null,
    "fileName": null,
    "caption": null,
    "mimetype": null
  }
}
```

| الحقل | الوصف |
|-------|-------|
| `event` | دائماً `"message.received"` |
| `sessionId` | معرّف الجلسة الذي أستقبل الرسالة |
| `data.type` | نوع الرسالة: `chat` / `image` / `video` / `audio` / `ptt` / `document` |
| `data.from` | رقم المُرسِل بصيغة `966501234567@c.us` |
| `data.body` | نص الرسالة (فارغ للرسائل الوسائطية) |
| `data.mediaUrl` | رابط الوسائط إن وُجدت |
| `data.caption` | تعليق الوسائط |
| `data.mimetype` | نوع الملف (مثل `image/jpeg`) |

---

## ملاحظات مهمة

- **عقدة Wait**: التأخير 2 ثانية مهم — يُقلّل من خطر حظر رقمك من واتساب.
- **Respond 200 OK**: يجب أن يكون أول رد للخادم، وإلا سيُعيد الخادم إرسال الرسالة.
- كل جلسة واتساب لها Webhook منفصل، يمكنك توجيهها لورك فلوهات مختلفة.
- الورك فلو المُحمَّل يحتوي على رابط خادمك محقوناً تلقائياً — ما عليك إلا إضافة مفتاح الـ API.
