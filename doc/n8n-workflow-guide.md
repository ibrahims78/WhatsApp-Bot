# دليل ورك فلو n8n لواتساب — شرح كامل

## ما هو هذا الورك فلو؟

هذا ورك فلو جاهز لـ **n8n** يربط نظام **WhatsApp Manager** بأتمتة متكاملة.  
يستقبل **جميع** أنواع رسائل الواتساب ويردّ عليها تلقائياً، مع وضع **Echo للاختبار** وتسجيل الأخطاء.

---

## الخطوة 1 — استيراد الورك فلو في n8n

1. افتح **n8n** → من القائمة الجانبية اختر **Workflows**
2. اضغط على زر **⊕ New** ثم **Import from file**
3. اختر الملف المُحمَّل `n8n-workflow-whatsapp.json`
4. سيفتح الورك فلو بـ **22 عقدة** جاهزة

> **ملاحظة**: رابط خادمك محقون تلقائياً في جميع عقد الإرسال. لا تحتاج لتعديل الروابط.

---

## الخطوة 2 — إضافة مفتاح API (الإعداد الوحيد المطلوب)

### أ. إنشاء مفتاح API في لوحة التحكم

1. افتح **لوحة التحكم** → من القائمة الجانبية اختر **مفاتيح API**
2. اضغط **إنشاء مفتاح جديد**
3. أدخل اسماً (مثل: `n8n-bot`) واضغط **إنشاء**
4. **انسخ المفتاح الآن** — لن يُعرض مجدداً

### ب. إضافة الـ Credential في n8n

1. في n8n، افتح أي عقدة إرسال (مثل **📤 Send Text Reply**)
2. عند حقل **Credential** اضغط **Create new credential**
3. اختر نوع **HTTP Header Auth**
4. أدخل:
   - **Name**: `X-API-Key`
   - **Value**: المفتاح الذي نسخته
5. اضغط **Save**

> **مهم**: هذا الـ credential واحد يُستخدم لجميع عقد الإرسال السبع (نص، صورة، فيديو، صوت، مستند، ملصق، موقع). بعد إنشائه للأولى، اختره من القائمة في باقي العقد.

---

## الخطوة 3 — تفعيل الورك فلو ونسخ رابط Webhook

1. اضغط **Active** (زر التبديل في أعلى يمين الشاشة)
2. افتح عقدة **📥 Receive WhatsApp Message**
3. ستجد قسم **Webhook URLs** — انسخ **Production URL**
   - يبدو هكذا: `https://your-n8n.com/webhook/whatsapp-incoming`

---

## الخطوة 4 — ربط الـ Webhook بجلسة واتساب

1. افتح **لوحة التحكم** → **الجلسات** → افتح جلستك
2. في تبويب **الإعدادات** ابحث عن حقل **Webhook URL**
3. الصق رابط الـ Webhook الذي نسخته
4. اضغط **حفظ**

الآن كل رسالة واردة على هذا الرقم ستُرسَل تلقائياً إلى n8n.

---

## الخطوة 5 — اختبار الاتصال

أرسل على الرقم المتصل:

```
صدى مرحبا
```

يجب أن تستلم خلال 3-5 ثوانٍ:

```
🔁 صدى: مرحبا
Echo: مرحبا
```

إذا وصل الرد ← الاتصال يعمل بنجاح ✅

---

## شرح ردود الورك فلو لكل نوع رسالة

### 💬 رسالة نصية (Text)

| ما ترسله | الرد التلقائي |
|----------|--------------|
| `مرحبا` أو `هلا` أو `hello` أو `السلام` | `أهلاً وسهلاً! 👋 كيف يمكنني مساعدتك؟` |
| `سعر` أو `price` أو `كم` أو `تكلفة` | `يرجى التواصل مع فريق المبيعات للاستفسار عن الأسعار 📋` |
| `وقت` أو `دوام` أو `hours` أو `متى` | `أوقات العمل: الأحد – الخميس 9 صباحاً – 6 مساءً 🕘` |
| `مساعدة` أو `help` | `يمكنني مساعدتك! 🤝 أرسل "صدى <رسالة>" لاختبار البوت.` |
| **أي رسالة أخرى** | `شكراً لتواصلك! سنرد عليك قريباً.` |
| `صدى <نص>` أو `echo <text>` | `🔁 صدى: <النص>` *(وضع اختبار)* |

**العقدة المسؤولة**: `💬 Handle Text`

---

### 🖼️ صورة (Image)

عند إرسال أي صورة، يرد البوت نصياً:

```
تم استلام صورتك 📷
Image received 📷
```

إذا كانت الصورة تحتوي تعليق (caption)، يُضاف في الرد:

```
تم استلام صورتك 📷 — [التعليق هنا]
```

**العقدة المسؤولة**: `🖼️ Handle Image`

---

### 🎬 فيديو (Video)

عند إرسال فيديو، يرد البوت:

```
تم استلام الفيديو 🎬
Video received 🎬
```

إذا كان الفيديو يحتوي تعليق:

```
تم استلام الفيديو 🎬 — [التعليق هنا]
```

**العقدة المسؤولة**: `🎬 Handle Video`

---

### 🎵 رسالة صوتية أو ملف صوتي (Audio / Voice)

| النوع | الرد |
|-------|------|
| رسالة صوتية (ميكروفون) | `تم استلام رسالتك الصوتية 🎙️` |
| ملف صوتي (mp3/ogg...) | `تم استلام الملف الصوتي 🎵` |

**العقدة المسؤولة**: `🎵 Handle Audio / Voice`  
*(يميّز بين `ptt` — رسالة صوتية مباشرة، و `audio` — ملف صوتي)*

---

### 📄 مستند أو ملف (Document)

عند إرسال أي ملف (PDF، Word، Excel، ZIP...):

```
تم استلام الملف 📄: [اسم الملف]
Document received 📄: [اسم الملف]
```

مثال عند إرسال `report.pdf`:

```
تم استلام الملف 📄: report.pdf
Document received 📄: report.pdf
```

**العقدة المسؤولة**: `📄 Handle Document`

---

### 🎯 ملصق (Sticker)

عند إرسال أي ملصق:

```
تم استلام الملصق 🎯
Sticker received 🎯
```

**العقدة المسؤولة**: `🎯 Handle Sticker`

---

### 📍 موقع جغرافي (Location)

عند مشاركة موقع، يرد البوت برسالة تحتوي رابط Google Maps مباشر:

```
تم استلام موقعك 📍 — [وصف الموقع إن وُجد]
https://maps.google.com/?q=[خط العرض],[خط الطول]
Location received 📍
```

مثال:

```
تم استلام موقعك 📍 — الرياض
https://maps.google.com/?q=24.7136,46.6753
Location received 📍
```

**العقدة المسؤولة**: `📍 Handle Location`

---

## مخطط التدفق الكامل

```
📥 Receive WhatsApp Message
        │
        ├──▶ ✅ Respond 200 OK  (فوري — لمنع إعادة الإرسال)
        │
        └──▶ 🔍 Extract Message Fields
                    │
                    ▼
            🔀 Route by Message Type
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
        🔀 Route by Reply Type
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

## تخصيص الردود

لتغيير رد أي نوع، افتح عقدة **Handle** المقابلة وعدّل الكود:

### تغيير رد الصورة من نص إلى صورة أخرى

في عقدة **🖼️ Handle Image**:
```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'image',                              // ← غيّر من 'text'
  replyImageUrl: 'https://example.com/reply.jpg',  // ← رابط صورتك
  replyCaption: 'شكراً على الصورة! 📷'
};
```

### تغيير رد الصوت إلى ملف صوتي

في عقدة **🎵 Handle Audio / Voice**:
```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'audio',
  replyAudioUrl: 'https://example.com/reply.mp3'
};
```

### الرد على الموقع بموقع آخر

في عقدة **📍 Handle Location**:
```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'location',
  replyLat: 24.7136,
  replyLng: 46.6753,
  replyLocationDesc: 'مقر شركتنا — الرياض'
};
```

### الرد بمستند

```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'document',
  replyFileUrl: 'https://example.com/catalog.pdf',
  replyFileName: 'catalog.pdf',
  replyCaption: 'إليك الكتالوج 📋'
};
```

### الرد بفيديو

```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'video',
  replyVideoUrl: 'https://example.com/promo.mp4',
  replyCaption: 'شاهد عروضنا! 🎬'
};
```

### الرد بملصق

```javascript
return {
  sessionId,
  phoneNumber: phone,
  replyType: 'sticker',
  replyImageUrl: 'https://example.com/sticker.png'
  // أي صورة PNG/JPG/WebP تُحوَّل تلقائياً
};
```

---

## جدول أنواع الرسائل المدعومة

| النوع | نوع واتساب | الاستقبال | الرد الافتراضي | يمكن الرد بـ |
|-------|-----------|-----------|----------------|-------------|
| نص | `chat` | ✅ + كلمات مفتاحية | نص حسب الكلمة | text, image, video, audio, document, sticker, location |
| صورة | `image` | ✅ | نص تأكيد | text, image |
| فيديو | `video` | ✅ | نص تأكيد | text, video |
| صوت مباشر | `ptt` | ✅ | نص تأكيد | text, audio |
| ملف صوتي | `audio` | ✅ | نص تأكيد | text, audio |
| مستند | `document` | ✅ | نص + اسم الملف | text, document |
| ملصق | `sticker` | ✅ | نص تأكيد | text, sticker |
| موقع | `location` | ✅ | نص + رابط Maps | text, location |

---

## payload الرسائل الواردة (للمطورين)

هذا هو الـ payload الذي يصل لـ n8n من خادم واتساب:

```json
{
  "event": "message.received",
  "sessionId": "my-session",
  "data": {
    "type": "chat",
    "from": "966501234567@c.us",
    "to": "966509876543@c.us",
    "body": "مرحبا",
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
| `sessionId` | معرّف الجلسة في لوحة التحكم |
| `data.type` | نوع الرسالة: `chat` / `image` / `video` / `audio` / `ptt` / `document` / `sticker` / `location` |
| `data.from` | رقم المُرسِل بصيغة `966501234567@c.us` |
| `data.body` | نص الرسالة (فارغ للوسائط) |
| `data.mediaUrl` | رابط الوسائط (صورة/فيديو/صوت/مستند) |
| `data.fileName` | اسم الملف للمستندات |
| `data.caption` | تعليق الصورة أو الفيديو |
| `data.mimetype` | نوع الملف مثل `image/jpeg` أو `video/mp4` |
| `data.lat` / `data.lng` | إحداثيات الموقع (للمواقع فقط) |
| `data.loc` | وصف نصي للموقع (للمواقع فقط) |

---

## ملاحظات مهمة

- **تأخير 2 ثانية**: ضروري قبل الإرسال لتجنب حظر واتساب للرقم.
- **Respond 200 OK**: يجب أن يُرسَل **فوراً** لإيقاف إعادة المحاولة من الخادم.
- **مفتاح API واحد** يكفي لجميع عقد الإرسال السبع.
- **كل جلسة** لها Webhook مستقل — يمكن ربط أرقام مختلفة بورك فلوهات مختلفة.
- **الملصقات**: أي صورة PNG/JPG/WebP تُحوَّل تلقائياً بواسطة الـ API.
- **وضع Echo** (`صدى <نص>`): أفضل طريقة للتحقق من عمل الاتصال الكامل.
