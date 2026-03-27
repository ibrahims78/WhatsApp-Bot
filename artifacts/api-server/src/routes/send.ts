import { Router, type IRouter } from "express";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, hasPermission, apiKeyAllowsSession } from "../lib/auth";
import { getClient } from "../lib/whatsapp-manager";
import { logger } from "../lib/logger";
import { writeAuditLog } from "../lib/audit";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const router: IRouter = Router();

/**
 * Validate that a phone number string contains enough digits to be a real number.
 * Returns an error message string if invalid, or null if valid.
 * Minimum 7 digits (shortest international numbers e.g. Niue +683 XXXXX).
 * Maximum 15 digits (E.164 standard).
 */
function validatePhoneNumber(number: string): string | null {
  if (!number || typeof number !== "string") return "Phone number is required";
  const trimmed = number.trim();
  if (!trimmed) return "Phone number is required";
  // Already a WhatsApp ID — pass through basic checks
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us") || trimmed.endsWith("@lid")) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return `Phone number too short: '${trimmed}' (minimum 7 digits)`;
  if (digits.length > 15) return `Phone number too long: '${trimmed}' (maximum 15 digits per E.164)`;
  return null;
}

function formatNumber(number: string): string {
  // Already a valid WhatsApp chat ID — pass through unchanged
  if (number.endsWith("@c.us") || number.endsWith("@g.us")) return number;
  // @lid is a Linked Device ID used in newer multi-device accounts.
  // Convert it to @c.us so wppconnect can resolve the actual chat.
  if (number.includes("@")) {
    const digits = number.split("@")[0];
    return `${digits}@c.us`;
  }
  const clean = number.replace(/\D/g, "");
  return `${clean}@c.us`;
}

function isUnreachable(number: string): boolean {
  return number.endsWith("@newsletter");
}

// wppconnect cannot accept base64 Data URLs directly — it treats them as file paths.
// This helper writes the base64 content to a temp file and returns the path.
// The caller MUST call cleanupTempFile(path) after wppconnect finishes.
function saveTempFile(dataUrl: string, fallbackExt: string): string | null {
  if (!dataUrl.startsWith("data:")) return null;

  try {
    // Extract MIME type and base64 data from "data:<mime>;base64,<data>"
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mime = matches[1];
    const base64Data = matches[2];

    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/x-msvideo": "avi",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/x-m4a": "m4a",
      "audio/mp4": "m4a",
      "application/pdf": "pdf",
    };

    const ext = extMap[mime] || fallbackExt;
    const tmpPath = join(tmpdir(), `wa_${randomUUID()}.${ext}`);

    writeFileSync(tmpPath, Buffer.from(base64Data, "base64"));
    return tmpPath;
  } catch (e) {
    logger.warn({ err: e }, "Failed to save temp file for media send");
    return null;
  }
}

function cleanupTempFile(path: string | null): void {
  if (path && existsSync(path)) {
    try { unlinkSync(path); } catch (_) { /* ignore */ }
  }
}

async function logMessage(sessionId: string, toNumber: string, messageType: string, content?: string | null, mediaUrl?: string | null, caption?: string | null) {
  const [session] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, sessionId));
  if (!session) return;

  await db.insert(messagesTable).values({
    sessionId,
    direction: "outbound",
    fromNumber: session.phoneNumber || sessionId,
    toNumber,
    messageType,
    content: content || null,
    mediaUrl: mediaUrl || null,
    caption: caption || null,
    status: "sent",
    timestamp: new Date(),
  });

  await db
    .update(whatsappSessionsTable)
    .set({ totalMessagesSent: sql`${whatsappSessionsTable.totalMessagesSent} + 1` })
    .where(eq(whatsappSessionsTable.id, sessionId));
}

// ── Feature-flag check ────────────────────────────────────────────────────────
// Returns false (blocked) only when the session has features configured AND
// the specific feature is explicitly set to false.
// No features configured → all allowed.
async function isFeatureAllowed(sessionId: string, feature: string): Promise<boolean> {
  const [session] = await db
    .select({ features: whatsappSessionsTable.features })
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, sessionId));
  if (!session) return true;
  if (!session.features) return true;
  try {
    const feats: Record<string, boolean> = JSON.parse(session.features);
    if (Object.keys(feats).length === 0) return true;
    // If key not present → default allow; blocked only when explicitly false
    return feats[feature] !== false;
  } catch {
    return true;
  }
}

function isMsgNotFound(e: any): boolean {
  return e?.code === "msg_not_found" || (typeof e?.message === "string" && e.message.includes("not found"));
}

function isNoLidError(e: any): boolean {
  const msg: string = e?.message ?? "";
  return msg.includes("No LID for user") || msg.includes("no lid") || msg.includes("LID");
}

// Try sending with @c.us format first; if wppconnect throws msg_not_found (chat not found),
// retry with @lid format. @lid contacts are newer multi-device WhatsApp accounts.
// If wppconnect throws "No LID for user" (multi-device LID cache miss), retry once
// after a short delay — this is usually a transient resolution failure.
async function trySend<T>(number: string, fn: (chatId: string) => Promise<T>): Promise<T> {
  const primaryId = formatNumber(number);
  try {
    return await fn(primaryId);
  } catch (e: any) {
    // "No LID for user" — wppconnect couldn't resolve the linked-device ID.
    // Retry after 1.5 s; this is almost always a transient cache miss.
    if (isNoLidError(e)) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        return await fn(primaryId);
      } catch (e2: any) {
        // Still failing — try the @lid form as a last resort
        if (primaryId.endsWith("@c.us")) {
          try {
            return await fn(primaryId.replace("@c.us", "@lid"));
          } catch { /* ignore — throw original */ }
        }
        throw new Error(`Failed to deliver message (LID resolution error): ${e2.message || e.message}`);
      }
    }
    if (isMsgNotFound(e) && primaryId.endsWith("@c.us")) {
      const lidId = primaryId.replace("@c.us", "@lid");
      try {
        return await fn(lidId);
      } catch (_e2: any) {
        // @lid also failed — throw original error to let caller decide
        throw e;
      }
    }
    throw e;
  }
}

async function sendText(sessionId: string, number: string, message: string, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !message) {
    res.status(400).json({ success: false, error: "sessionId, number, and message are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  if (!await isFeatureAllowed(sessionId, "sendText")) {
    res.status(403).json({ success: false, error: "sendText is disabled for this session" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await trySend(number, (chatId) => client.sendText(chatId, message));
    await logMessage(sessionId, number, "text", message);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "text", message);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send text");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendImage(sessionId: string, number: string, imageUrl: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !imageUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and imageUrl are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  if (!await isFeatureAllowed(sessionId, "sendImage")) {
    res.status(403).json({ success: false, error: "sendImage is disabled for this session" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }

  const tmpFile = saveTempFile(imageUrl, "jpg");
  const filePath = tmpFile || imageUrl;

  try {
    const result = await trySend(number, (chatId) => client.sendImage(chatId, filePath, "image", caption || ""));
    await logMessage(sessionId, number, "image", caption, imageUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "image", caption, imageUrl, caption);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send image");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    cleanupTempFile(tmpFile);
  }
}

async function sendVideo(sessionId: string, number: string, videoUrl: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !videoUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and videoUrl are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  if (!await isFeatureAllowed(sessionId, "sendVideo")) {
    res.status(403).json({ success: false, error: "sendVideo is disabled for this session" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }

  const tmpFile = saveTempFile(videoUrl, "mp4");
  const filePath = tmpFile || videoUrl;

  try {
    const result = await trySend(number, (chatId) => client.sendFile(chatId, filePath, "video.mp4", caption || ""));
    await logMessage(sessionId, number, "video", caption, videoUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "video", caption, videoUrl, caption);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send video");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    cleanupTempFile(tmpFile);
  }
}

async function sendAudio(sessionId: string, number: string, audioUrl: string, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !audioUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and audioUrl are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  if (!await isFeatureAllowed(sessionId, "sendAudio")) {
    res.status(403).json({ success: false, error: "sendAudio is disabled for this session" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }

  const tmpFile = saveTempFile(audioUrl, "mp3");
  const filePath = tmpFile || audioUrl;
  const audioExt = tmpFile ? (tmpFile.split(".").pop() || "mp3") : "mp3";
  const audioFileName = `audio.${audioExt}`;

  try {
    let result: any;
    try {
      // Try as a voice note (PTT) first — works best with OGG/OPUS format
      result = await trySend(number, (chatId) => client.sendVoice(chatId, filePath));
    } catch (voiceErr: any) {
      // sendVoice failed (e.g., unsupported format or wppconnect issue)
      // Fall back to sending as a regular audio file attachment
      req.log.warn({ sessionId, err: voiceErr }, "sendVoice failed — falling back to sendFile for audio");
      result = await trySend(number, (chatId) => client.sendFile(chatId, filePath, audioFileName, ""));
    }
    await logMessage(sessionId, number, "audio", null, audioUrl);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "audio", null, audioUrl);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send audio");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    cleanupTempFile(tmpFile);
  }
}

async function sendFile(sessionId: string, number: string, fileUrl: string, fileName: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !fileUrl || !fileName) {
    res.status(400).json({ success: false, error: "sessionId, number, fileUrl, and fileName are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  if (!await isFeatureAllowed(sessionId, "sendFile")) {
    res.status(403).json({ success: false, error: "sendFile is disabled for this session" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }

  const ext = fileName.includes(".") ? fileName.split(".").pop() || "bin" : "bin";
  const tmpFile = saveTempFile(fileUrl, ext);
  const filePath = tmpFile || fileUrl;

  try {
    const result = await trySend(number, (chatId) => client.sendFile(chatId, filePath, fileName, caption || ""));
    await logMessage(sessionId, number, "file", caption, fileUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "file", caption, fileUrl, caption);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send file");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    cleanupTempFile(tmpFile);
  }
}

async function sendLocation(sessionId: string, number: string, lat: number, lng: number, description: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || lat === undefined || lng === undefined) {
    res.status(400).json({ success: false, error: "sessionId, number, lat, and lng are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await trySend(number, (chatId) => client.sendLocation(chatId, lat, lng, description || ""));
    await logMessage(sessionId, number, "location", description || `${lat},${lng}`);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "location", description || `${lat},${lng}`);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send location");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendSticker(sessionId: string, number: string, stickerUrl: string, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !stickerUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and stickerUrl are required" });
    return;
  }
  const phoneErr = validatePhoneNumber(number);
  if (phoneErr) { res.status(400).json({ success: false, error: phoneErr }); return; }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }

  const tmpFile = saveTempFile(stickerUrl, "webp");
  const filePath = tmpFile || stickerUrl;

  try {
    const result = await trySend(number, (chatId) => client.sendImageAsStickerAuto(chatId, filePath));
    await logMessage(sessionId, number, "sticker", null, stickerUrl);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    if (isMsgNotFound(e)) {
      await logMessage(sessionId, number, "sticker", null, stickerUrl);
      res.json({ success: true, messageId: null });
      return;
    }
    req.log.error({ sessionId, err: e }, "Failed to send sticker");
    res.status(500).json({ success: false, error: e.message });
  } finally {
    cleanupTempFile(tmpFile);
  }
}

/**
 * Check that the user has permission for a send action and that their API key
 * (if used) allows access to the target session.
 * Returns true if access is granted, false if the response was already sent.
 */
async function checkSendAccess(req: any, res: any, sessionId: string, action: string): Promise<boolean> {
  const user = req.user;
  const apiKeyRecord = req.apiKeyRecord;

  // 1. Check if API key allows this session
  if (apiKeyRecord && !apiKeyAllowsSession(apiKeyRecord, sessionId)) {
    res.status(403).json({ success: false, error: "This API key is not authorized to access this session" });
    return false;
  }

  // 2. Check employee session ownership (employees can only send via their own sessions)
  if (user.role !== "admin") {
    const [session] = await db.select({ userId: whatsappSessionsTable.userId })
      .from(whatsappSessionsTable)
      .where(eq(whatsappSessionsTable.id, sessionId));
    if (session && session.userId !== null && session.userId !== user.id) {
      res.status(403).json({ success: false, error: "Access denied: this session belongs to another user" });
      return false;
    }
  }

  // 3. Check granular user permission for this action
  if (!hasPermission(user, action)) {
    res.status(403).json({ success: false, error: `You do not have permission to perform: ${action}` });
    return false;
  }

  return true;
}

// Flat routes: POST /send/*  (sessionId in body)
router.post("/send/text",     requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendText"))     return; sendText(req.body.sessionId,     req.body.number, req.body.message,  req, res); });
router.post("/send/image",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendImage"))    return; sendImage(req.body.sessionId,    req.body.number, req.body.imageUrl, req.body.caption, req, res); });
router.post("/send/video",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendVideo"))    return; sendVideo(req.body.sessionId,    req.body.number, req.body.videoUrl, req.body.caption, req, res); });
router.post("/send/audio",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendAudio"))    return; sendAudio(req.body.sessionId,    req.body.number, req.body.audioUrl, req, res); });
router.post("/send/file",     requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendFile"))     return; sendFile(req.body.sessionId,     req.body.number, req.body.fileUrl, req.body.fileName, req.body.caption, req, res); });
router.post("/send/location", requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendLocation")) return; sendLocation(req.body.sessionId, req.body.number, req.body.lat, req.body.lng, req.body.description, req, res); });
router.post("/send/sticker",  requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.body.sessionId, "sendSticker"))  return; sendSticker(req.body.sessionId,  req.body.number, req.body.stickerUrl, req, res); });

// RESTful routes: POST /sessions/:id/send/*  (sessionId in URL — used by n8n workflow)
router.post("/sessions/:id/send/text",     requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendText"))     return; sendText(req.params.id,     req.body.number, req.body.message,  req, res); });
router.post("/sessions/:id/send/image",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendImage"))    return; sendImage(req.params.id,    req.body.number, req.body.imageUrl, req.body.caption, req, res); });
router.post("/sessions/:id/send/video",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendVideo"))    return; sendVideo(req.params.id,    req.body.number, req.body.videoUrl, req.body.caption, req, res); });
router.post("/sessions/:id/send/audio",    requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendAudio"))    return; sendAudio(req.params.id,    req.body.number, req.body.audioUrl, req, res); });
router.post("/sessions/:id/send/file",     requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendFile"))     return; sendFile(req.params.id,     req.body.number, req.body.fileUrl, req.body.fileName, req.body.caption, req, res); });
router.post("/sessions/:id/send/location", requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendLocation")) return; sendLocation(req.params.id, req.body.number, req.body.lat, req.body.lng, req.body.description, req, res); });
router.post("/sessions/:id/send/sticker",  requireAuth, async (req, res) => { if (!await checkSendAccess(req, res, req.params.id, "sendSticker"))  return; sendSticker(req.params.id,  req.body.number, req.body.stickerUrl, req, res); });

export default router;
