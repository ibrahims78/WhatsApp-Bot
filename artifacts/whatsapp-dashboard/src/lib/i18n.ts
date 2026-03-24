export type SupportedLanguage = 'en' | 'ar';

export const translations = {
  en: {
    // General
    app_name: "WhatsApp Manager",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    actions: "Actions",
    status: "Status",
    name: "Name",
    loading: "Loading...",
    success: "Success",
    error: "Error",
    copied: "Copied to clipboard",

    // Nav
    nav_dashboard: "Dashboard",
    nav_sessions: "Sessions",
    nav_users: "Users",
    nav_api_keys: "API Keys",
    nav_send_message: "Send Message",
    nav_logout: "Logout",
    
    // Dashboard
    dash_total_sessions: "Total Sessions",
    dash_connected: "Connected",
    dash_disconnected: "Disconnected",
    dash_messages_today: "Messages Today",
    dash_sent: "Sent",
    dash_received: "Received",
    dash_message_volume: "Message Volume Over Time",
    
    // Sessions
    sess_add_new: "Add New Session",
    sess_create_title: "Create Session",
    sess_name_placeholder: "e.g. Sales Team Line",
    sess_connect: "Connect",
    sess_disconnect: "Disconnect",
    sess_view: "View Details",
    sess_status_connected: "Connected",
    sess_status_connecting: "Connecting",
    sess_status_disconnected: "Disconnected",
    sess_status_banned: "Banned",
    sess_scan_qr: "Scan QR Code",
    sess_scan_desc: "Open WhatsApp on your phone and scan this QR code to link the device.",
    
    // Session Details
    sd_overview: "Overview",
    sd_messages: "Messages",
    sd_settings: "Settings",
    sd_phone_number: "Phone Number",
    sd_created: "Created At",
    sd_webhook_url: "Webhook URL",
    sd_update_webhook: "Update Webhook",
    sd_features: "Allowed Features",
    sd_update_features: "Update Features",
    
    // Users
    user_add_new: "Add User",
    user_username: "Username",
    user_role: "Role",
    user_admin: "Admin",
    user_employee: "Employee",
    user_password: "Password",
    user_email: "Email",
    
    // API Keys
    key_add_new: "Generate API Key",
    key_prefix: "Prefix",
    key_last_used: "Last Used",
    key_secret_warning: "Store this secret key safely. It will not be shown again!",
    
    // Send
    send_title: "Send Campaign/Message",
    send_select_session: "Select Session",
    send_recipient: "Recipient Number (with country code)",
    send_type: "Message Type",
    send_content: "Message Content",
    send_media_url: "Media URL",
    send_caption: "Caption (Optional)",
    send_file_name: "File Name",
    send_btn: "Send Message",
    
    // Login
    login_title: "Welcome Back",
    login_subtitle: "Sign in to manage your WhatsApp instances",
    login_username: "Username",
    login_password: "Password",
    login_btn: "Sign In"
  },
  ar: {
    // General
    app_name: "مدير واتساب",
    cancel: "إلغاء",
    save: "حفظ",
    delete: "حذف",
    edit: "تعديل",
    create: "إنشاء",
    actions: "الإجراءات",
    status: "الحالة",
    name: "الاسم",
    loading: "جاري التحميل...",
    success: "نجاح",
    error: "خطأ",
    copied: "تم النسخ إلى الحافظة",

    // Nav
    nav_dashboard: "لوحة القيادة",
    nav_sessions: "الجلسات",
    nav_users: "المستخدمين",
    nav_api_keys: "مفاتيح API",
    nav_send_message: "إرسال رسالة",
    nav_logout: "تسجيل الخروج",
    
    // Dashboard
    dash_total_sessions: "إجمالي الجلسات",
    dash_connected: "متصل",
    dash_disconnected: "مفصول",
    dash_messages_today: "رسائل اليوم",
    dash_sent: "تم الإرسال",
    dash_received: "تم الاستلام",
    dash_message_volume: "حجم الرسائل بمرور الوقت",
    
    // Sessions
    sess_add_new: "إضافة جلسة جديدة",
    sess_create_title: "إنشاء جلسة",
    sess_name_placeholder: "مثال: خط فريق المبيعات",
    sess_connect: "اتصال",
    sess_disconnect: "قطع الاتصال",
    sess_view: "عرض التفاصيل",
    sess_status_connected: "متصل",
    sess_status_connecting: "قيد الاتصال",
    sess_status_disconnected: "مفصول",
    sess_status_banned: "محظور",
    sess_scan_qr: "امسح رمز الاستجابة السريعة",
    sess_scan_desc: "افتح تطبيق واتساب على هاتفك وامسح الرمز لربط الجهاز.",
    
    // Session Details
    sd_overview: "نظرة عامة",
    sd_messages: "الرسائل",
    sd_settings: "الإعدادات",
    sd_phone_number: "رقم الهاتف",
    sd_created: "تاريخ الإنشاء",
    sd_webhook_url: "رابط الـ Webhook",
    sd_update_webhook: "تحديث الـ Webhook",
    sd_features: "الميزات المسموحة",
    sd_update_features: "تحديث الميزات",
    
    // Users
    user_add_new: "إضافة مستخدم",
    user_username: "اسم المستخدم",
    user_role: "الدور",
    user_admin: "مدير",
    user_employee: "موظف",
    user_password: "كلمة المرور",
    user_email: "البريد الإلكتروني",
    
    // API Keys
    key_add_new: "إنشاء مفتاح API",
    key_prefix: "البادئة",
    key_last_used: "آخر استخدام",
    key_secret_warning: "احفظ هذا المفتاح السري بأمان. لن يتم عرضه مرة أخرى!",
    
    // Send
    send_title: "إرسال حملة/رسالة",
    send_select_session: "اختر الجلسة",
    send_recipient: "رقم المستلم (مع رمز الدولة)",
    send_type: "نوع الرسالة",
    send_content: "محتوى الرسالة",
    send_media_url: "رابط الوسائط",
    send_caption: "التعليق (اختياري)",
    send_file_name: "اسم الملف",
    send_btn: "إرسال الرسالة",
    
    // Login
    login_title: "مرحباً بعودتك",
    login_subtitle: "قم بتسجيل الدخول لإدارة مثيلات واتساب الخاصة بك",
    login_username: "اسم المستخدم",
    login_password: "كلمة المرور",
    login_btn: "تسجيل الدخول"
  }
};

export function getTranslation(lang: SupportedLanguage, key: keyof typeof translations['en']): string {
  return translations[lang][key] || translations['en'][key] || key;
}
