import { Router, type IRouter } from "express";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { startSession, stopSession, getQrCode } from "../lib/whatsapp-manager";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /sessions
router.get("/sessions", requireAuth, async (req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(whatsappSessionsTable)
    .orderBy(whatsappSessionsTable.createdAt);
  res.json(sessions);
});

// POST /sessions
router.post("/sessions", requireAuth, async (req, res): Promise<void> => {
  const { name, webhookUrl } = req.body;
  if (!name) {
    res.status(400).json({ error: "Session name is required" });
    return;
  }

  const id = `session_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

  const [session] = await db
    .insert(whatsappSessionsTable)
    .values({
      id,
      name,
      status: "disconnected",
      webhookUrl: webhookUrl || null,
    })
    .returning();

  res.status(201).json(session);
});

// GET /sessions/:id
router.get("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(session);
});

// DELETE /sessions/:id
router.delete("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    await stopSession(id);
  } catch (e) {
    logger.warn({ sessionId: id, err: e }, "Error stopping session during delete");
  }

  const [session] = await db
    .delete(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.sendStatus(204);
});

// POST /sessions/:id/connect
router.post("/sessions/:id/connect", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Start session in background
  startSession(id).catch((e) => {
    logger.error({ sessionId: id, err: e }, "Background session start failed");
  });

  res.json({ success: true, message: "Connection initiated. Scan QR code." });
});

// POST /sessions/:id/disconnect
router.post("/sessions/:id/disconnect", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  await stopSession(id);
  res.json({ success: true, message: "Session disconnected" });
});

// GET /sessions/:id/qr
router.get("/sessions/:id/qr", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const qr = getQrCode(id);
  res.json({ qr, status: session.status });
});

// GET /sessions/:id/stats
router.get("/sessions/:id/stats", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySentResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.sessionId, id),
        eq(messagesTable.direction, "outbound"),
        gte(messagesTable.timestamp, todayStart)
      )
    );

  const [todayReceivedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.sessionId, id),
        eq(messagesTable.direction, "inbound"),
        gte(messagesTable.timestamp, todayStart)
      )
    );

  const typeStats = await db
    .select({
      messageType: messagesTable.messageType,
      count: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(eq(messagesTable.sessionId, id))
    .groupBy(messagesTable.messageType);

  const messagesByType = { text: 0, image: 0, video: 0, audio: 0, file: 0 };
  for (const row of typeStats) {
    const t = row.messageType as keyof typeof messagesByType;
    if (t in messagesByType) {
      messagesByType[t] = row.count;
    }
  }

  res.json({
    totalSent: session.totalMessagesSent,
    totalReceived: session.totalMessagesReceived,
    todaySent: todaySentResult?.count ?? 0,
    todayReceived: todayReceivedResult?.count ?? 0,
    messagesByType,
  });
});

// GET /sessions/:id/messages
router.get("/sessions/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const limit = parseInt((req.query.limit as string) || "50", 10);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.sessionId, id))
    .orderBy(desc(messagesTable.timestamp))
    .limit(limit)
    .offset(offset);

  res.json(messages);
});

// PATCH /sessions/:id/webhook
router.patch("/sessions/:id/webhook", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { webhookUrl, webhookEvents } = req.body;

  const [session] = await db
    .update(whatsappSessionsTable)
    .set({ webhookUrl: webhookUrl ?? null, webhookEvents: webhookEvents ?? null })
    .where(eq(whatsappSessionsTable.id, id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(session);
});

// PATCH /sessions/:id/features
router.patch("/sessions/:id/features", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { features } = req.body;

  const [session] = await db
    .update(whatsappSessionsTable)
    .set({ features: features ?? null })
    .where(eq(whatsappSessionsTable.id, id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(session);
});

export default router;
