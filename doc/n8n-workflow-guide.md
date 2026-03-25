# دليل ورك فلو n8n لواتساب — شرح كامل

## ما هو هذا الورك فلو؟

هذا ورك فلو جاهز لـ **n8n** يربط نظام **WhatsApp Manager** بأتمتة متكاملة.  
يستقبل كل أنواع رسائل الواتساب الواردة ويردّ عليها بالنوع المناسب (نص / صورة / صوت / مستند) تلقائياً.

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
        ┌───┬───┬───┬───┬────────┐
        ▼   ▼   ▼   ▼   ▼       ▼
      Text Img Vid Aud Doc    Other
        │   │   │   │   │
        └───┴───┴───┴───┘
                │
                ▼
        🔗 Merge All Replies
                │
                ▼
        ⏱️ Wait 2 Seconds
                │
                ▼
        🔀 Route by Reply Type (إرسال)
        ┌───┬───┬───┬────────┐
        ▼   ▼   ▼   ▼
      📤   🖼️  🎵  📄
      Text Img Aud Doc
```

---

## العقد وما تفعله

### جانب الاستقبال

| العقدة | المهمة |
|--------|--------|
| 📥 Receive WhatsApp Message | يستقبل الرسائل الواردة عبر Webhook POST |
| ✅ Respond 200 OK | يُقرّ الاستلام فوراً لمنع إعادة المحاولة |
| 🔍 Extract Message Fields | يُعالج الـ payload ويستخرج الحقول |
| 🔀 Route by Message Type | يوجّه حسب نوع الرسالة الواردة |
| 💬 Handle Text | يعالج الرسائل النصية (يرد بكلمات مفتاحية) |
| 🖼️ Handle Image | يعالج الصور الواردة |
| 🎬 Handle Video | يعالج الفيديو الوارد |
| 🎵 Handle Audio / Voice | يعالج الصوت والرسائل الصوتية |
| 📄 Handle Document | يعالج المستندات (PDF, DOCX, ZIP...) |
| 🔗 Merge All Replies | يجمع مخرجات كل المعالجات |
| ⏱️ Wait 2 Seconds | تأخير 2 ثانية لتجنب الحظر من واتساب |

### جانب الإرسال

| العقدة | ما ترسله | الحقول المطلوبة |
|--------|---------|-----------------|
| 🔀 Route by Reply Type | يوجّه حسب `replyType` | — |
| 📤 Send Text Reply | رسالة نصية | `replyText` |
| 🖼️ Send Image Reply | صورة | `replyImageUrl` + `replyCaption` (اختياري) |
| 🎵 Send Audio Reply | ملف صوتي | `replyAudioUrl` |
| 📄 Send Document Reply | مستند/ملف | `replyFileUrl` + `replyFileName` + `replyCaption` (اختياري) |

---

## كيف تغيّر نوع الرد؟

في كل عقدة Handle، حدّد `replyType` بالقيمة المناسبة وأضف الحقل المطلوب:

### مثال: الرد على صورة بصورة أخرى

في عقدة **🖼️ Handle Image**، عدّل الكود:
```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'image',                              // ← غيّر من 'text' إلى 'image'
  replyImageUrl: 'https://example.com/reply.jpg', // ← أضف رابط الصورة
  replyCaption: 'هذه صورة رد!',                   // ← اختياري
  receivedMediaUrl: mediaUrl
};
```

### مثال: الرد على مستند بمستند آخر

في عقدة **📄 Handle Document**:
```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'document',
  replyFileUrl: 'https://example.com/reply.pdf',
  replyFileName: 'document.pdf',
  replyCaption: 'إليك الملف المطلوب',
  receivedMediaUrl: mediaUrl
};
```

### مثال: الرد بملف صوتي

```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'audio',
  replyAudioUrl: 'https://example.com/reply.mp3'
};
```

---

## الإعدادات المطلوبة بعد الاستيراد

### 1. رابط Webhook

بعد استيراد الورك فلو في n8n وتفعيله، افتح عقدة **📥 Receive WhatsApp Message** وانسخ رابط الـ Webhook.  
ثم اذهب إلى **إعدادات الجلسة** في لوحة التحكم والصق الرابط في حقل **Webhook URL**.

### 2. مفتاح API (Credential)

في أي عقدة إرسال (📤/🖼️/🎵/📄)، أضف credential من نوع **HTTP Header Auth**:
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

---

## جدول أنواع الرسائل المدعومة

| النوع | القيمة | الاستقبال | الإرسال |
|-------|--------|-----------|---------|
| نص | `chat` | ✅ | ✅ (`replyType: 'text'`) |
| صورة | `image` | ✅ | ✅ (`replyType: 'image'`) |
| فيديو | `video` | ✅ | ✅ (أرسله كـ document) |
| صوت / رسالة صوتية | `audio` / `ptt` | ✅ | ✅ (`replyType: 'audio'`) |
| مستند | `document` | ✅ | ✅ (`replyType: 'document'`) |
| ملصق | `sticker` | ✅ (fallback) | — |
| موقع | `location` | ✅ (fallback) | — |

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
| `sessionId` | معرّف الجلسة التي استقبلت الرسالة |
| `data.type` | نوع الرسالة: `chat` / `image` / `video` / `audio` / `ptt` / `document` |
| `data.from` | رقم المُرسِل بصيغة `966501234567@c.us` |
| `data.body` | نص الرسالة (فارغ للوسائط) |
| `data.mediaUrl` | رابط الوسائط إن وُجدت |
| `data.fileName` | اسم الملف للمستندات |
| `data.caption` | تعليق الوسائط |
| `data.mimetype` | نوع الملف (مثل `image/jpeg`) |

---

## ملاحظات مهمة

- **عقدة Wait**: التأخير 2 ثانية يُقلّل من خطر حظر رقمك من واتساب.
- **Respond 200 OK**: يجب أن يكون أول رد للخادم، وإلا سيُعيد الخادم إرسال الرسالة.
- كل جلسة واتساب لها Webhook منفصل يمكنك توجيهها لورك فلوهات مختلفة.
- لإرسال فيديو: استخدم `replyType: 'document'` مع رابط الفيديو واسم الملف — واتساب يُشغّله تلقائياً.
