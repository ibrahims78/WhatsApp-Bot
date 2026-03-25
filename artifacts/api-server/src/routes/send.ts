import { Router, type IRouter } from "express";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getClient } from "../lib/whatsapp-manager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatNumber(number: string): string {
  // Ensure number is in format +XXX... for WPP
  const clean = number.replace(/\D/g, "");
  return `${clean}@c.us`;
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

async function sendText(sessionId: string, number: string, message: string, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !message) {
    res.status(400).json({ success: false, error: "sessionId, number, and message are required" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await client.sendText(formatNumber(number), message);
    await logMessage(sessionId, number, "text", message);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send text");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendImage(sessionId: string, number: string, imageUrl: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !imageUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and imageUrl are required" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await client.sendImage(formatNumber(number), imageUrl, "image", caption || "");
    await logMessage(sessionId, number, "image", caption, imageUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send image");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendVideo(sessionId: string, number: string, videoUrl: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !videoUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and videoUrl are required" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await client.sendVideoAsGif(formatNumber(number), videoUrl, "video", caption || "");
    await logMessage(sessionId, number, "video", caption, videoUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send video");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendAudio(sessionId: string, number: string, audioUrl: string, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !audioUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and audioUrl are required" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await client.sendVoice(formatNumber(number), audioUrl);
    await logMessage(sessionId, number, "audio", null, audioUrl);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send audio");
    res.status(500).json({ success: false, error: e.message });
  }
}

async function sendFile(sessionId: string, number: string, fileUrl: string, fileName: string, caption: string | undefined, req: any, res: any): Promise<void> {
  if (!sessionId || !number || !fileUrl || !fileName) {
    res.status(400).json({ success: false, error: "sessionId, number, fileUrl, and fileName are required" });
    return;
  }
  const client = getClient(sessionId);
  if (!client) { res.status(503).json({ success: false, error: "Session not connected" }); return; }
  try {
    const result = await client.sendFile(formatNumber(number), fileUrl, fileName, caption || "");
    await logMessage(sessionId, number, "file", caption, fileUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send file");
    res.status(500).json({ success: false, error: e.message });
  }
}

// Flat routes: POST /send/text  (sessionId in body)
router.post("/send/text",  requireAuth, (req, res) => sendText(req.body.sessionId,  req.body.number, req.body.message,  req, res));
router.post("/send/image", requireAuth, (req, res) => sendImage(req.body.sessionId, req.body.number, req.body.imageUrl, req.body.caption, req, res));
router.post("/send/video", requireAuth, (req, res) => sendVideo(req.body.sessionId, req.body.number, req.body.videoUrl, req.body.caption, req, res));
router.post("/send/audio", requireAuth, (req, res) => sendAudio(req.body.sessionId, req.body.number, req.body.audioUrl, req, res));
router.post("/send/file",  requireAuth, (req, res) => sendFile(req.body.sessionId,  req.body.number, req.body.fileUrl, req.body.fileName, req.body.caption, req, res));

// RESTful routes: POST /sessions/:id/send/text  (sessionId in URL — used by n8n workflow)
router.post("/sessions/:id/send/text",  requireAuth, (req, res) => sendText(req.params.id,  req.body.number, req.body.message,  req, res));
router.post("/sessions/:id/send/image", requireAuth, (req, res) => sendImage(req.params.id, req.body.number, req.body.imageUrl, req.body.caption, req, res));
router.post("/sessions/:id/send/video", requireAuth, (req, res) => sendVideo(req.params.id, req.body.number, req.body.videoUrl, req.body.caption, req, res));
router.post("/sessions/:id/send/audio", requireAuth, (req, res) => sendAudio(req.params.id, req.body.number, req.body.audioUrl, req, res));
router.post("/sessions/:id/send/file",  requireAuth, (req, res) => sendFile(req.params.id,  req.body.number, req.body.fileUrl, req.body.fileName, req.body.caption, req, res));

export default router;
