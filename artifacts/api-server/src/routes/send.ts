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

// POST /send/text
router.post("/send/text", requireAuth, async (req, res): Promise<void> => {
  const { sessionId, number, message } = req.body;
  if (!sessionId || !number || !message) {
    res.status(400).json({ success: false, error: "sessionId, number, and message are required" });
    return;
  }

  const client = getClient(sessionId);
  if (!client) {
    res.status(503).json({ success: false, error: "Session not connected" });
    return;
  }

  try {
    const result = await client.sendText(formatNumber(number), message);
    await logMessage(sessionId, number, "text", message);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send text");
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /send/image
router.post("/send/image", requireAuth, async (req, res): Promise<void> => {
  const { sessionId, number, imageUrl, caption } = req.body;
  if (!sessionId || !number || !imageUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and imageUrl are required" });
    return;
  }

  const client = getClient(sessionId);
  if (!client) {
    res.status(503).json({ success: false, error: "Session not connected" });
    return;
  }

  try {
    const result = await client.sendImage(formatNumber(number), imageUrl, "image", caption || "");
    await logMessage(sessionId, number, "image", caption, imageUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send image");
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /send/video
router.post("/send/video", requireAuth, async (req, res): Promise<void> => {
  const { sessionId, number, videoUrl, caption } = req.body;
  if (!sessionId || !number || !videoUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and videoUrl are required" });
    return;
  }

  const client = getClient(sessionId);
  if (!client) {
    res.status(503).json({ success: false, error: "Session not connected" });
    return;
  }

  try {
    const result = await client.sendVideoAsGif(formatNumber(number), videoUrl, "video", caption || "");
    await logMessage(sessionId, number, "video", caption, videoUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send video");
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /send/audio
router.post("/send/audio", requireAuth, async (req, res): Promise<void> => {
  const { sessionId, number, audioUrl } = req.body;
  if (!sessionId || !number || !audioUrl) {
    res.status(400).json({ success: false, error: "sessionId, number, and audioUrl are required" });
    return;
  }

  const client = getClient(sessionId);
  if (!client) {
    res.status(503).json({ success: false, error: "Session not connected" });
    return;
  }

  try {
    const result = await client.sendVoice(formatNumber(number), audioUrl);
    await logMessage(sessionId, number, "audio", null, audioUrl);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send audio");
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /send/file
router.post("/send/file", requireAuth, async (req, res): Promise<void> => {
  const { sessionId, number, fileUrl, fileName, caption } = req.body;
  if (!sessionId || !number || !fileUrl || !fileName) {
    res.status(400).json({ success: false, error: "sessionId, number, fileUrl, and fileName are required" });
    return;
  }

  const client = getClient(sessionId);
  if (!client) {
    res.status(503).json({ success: false, error: "Session not connected" });
    return;
  }

  try {
    const result = await client.sendFile(formatNumber(number), fileUrl, fileName, caption || "");
    await logMessage(sessionId, number, "file", caption, fileUrl, caption);
    res.json({ success: true, messageId: result?.id?.id || null });
  } catch (e: any) {
    req.log.error({ sessionId, err: e }, "Failed to send file");
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
