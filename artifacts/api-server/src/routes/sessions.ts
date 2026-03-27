import { Router, type IRouter } from "express";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { apiKeyAllowsSession } from "../lib/auth";
import { startSession, stopSession, deleteSessionFiles, getQrCode, isBrowserActive } from "../lib/whatsapp-manager";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";
import { writeAuditLog } from "../lib/audit";

const router: IRouter = Router();

/** Check if an employee owns a session (or is admin). Returns 403 if not. */
function canAccessSession(user: any, session: any, res: any): boolean {
  if (user.role === "admin") return true;
  // Employees can only access sessions they own
  if (session.userId !== user.id) {
    res.status(403).json({ error: "Access denied: this session belongs to another user" });
    return false;
  }
  return true;
}

/** Check if API key allows access to a session. Returns 403 if not. */
function canApiKeyAccessSession(req: any, sessionId: string, res: any): boolean {
  const apiKeyRecord = (req as any).apiKeyRecord;
  if (!apiKeyRecord) return true; // not API key auth
  if (!apiKeyAllowsSession(apiKeyRecord, sessionId)) {
    res.status(403).json({ error: "This API key is not authorized to access this session" });
    return false;
  }
  return true;
}

// GET /sessions
router.get("/sessions", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const apiKeyRecord = (req as any).apiKeyRecord;

  let sessions;
  if (user.role === "admin") {
    sessions = await db
      .select()
      .from(whatsappSessionsTable)
      .orderBy(whatsappSessionsTable.createdAt);
  } else {
    // Employee: only their own sessions
    sessions = await db
      .select()
      .from(whatsappSessionsTable)
      .where(eq(whatsappSessionsTable.userId, user.id))
      .orderBy(whatsappSessionsTable.createdAt);
  }

  // If API key has session restrictions, filter further
  if (apiKeyRecord?.allowedSessionIds) {
    try {
      const allowed: string[] = JSON.parse(apiKeyRecord.allowedSessionIds);
      if (allowed.length > 0) {
        sessions = sessions.filter((s) => allowed.includes(s.id));
      }
    } catch { /* ignore */ }
  }

  res.json(sessions);
});

// POST /sessions
router.post("/sessions", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name, webhookUrl } = req.body;
  if (!name) {
    res.status(400).json({ error: "Session name is required" });
    return;
  }

  // Check permission
  if (user.role !== "admin") {
    // Check granular permission: createSession
    const perms = user.permissions ? (() => { try { return JSON.parse(user.permissions); } catch { return null; } })() : null;
    if (perms && Object.keys(perms).length > 0 && perms["createSession"] === false) {
      res.status(403).json({ error: "You do not have permission to create sessions" });
      return;
    }

    // Check maxSessions limit
    if (user.maxSessions !== null && user.maxSessions !== undefined) {
      const [{ value: currentCount }] = await db
        .select({ value: count() })
        .from(whatsappSessionsTable)
        .where(eq(whatsappSessionsTable.userId, user.id));
      if (currentCount >= user.maxSessions) {
        res.status(403).json({ error: `Session limit reached. Your account allows a maximum of ${user.maxSessions} session(s).` });
        return;
      }
    }
  }

  const id = `session_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

  const [session] = await db
    .insert(whatsappSessionsTable)
    .values({
      id,
      userId: user.id,
      name,
      status: "disconnected",
      webhookUrl: webhookUrl || null,
    })
    .returning();

  await writeAuditLog({
    userId: user.id,
    username: user.username,
    action: "createSession",
    sessionId: id,
    details: { name },
    ipAddress: req.ip,
  });

  res.status(201).json(session);
});

// GET /sessions/:id
router.get("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;
  if (!canApiKeyAccessSession(req, id, res)) return;

  res.json(session);
});

// DELETE /sessions/:id
router.delete("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [existing] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, existing, res)) return;

  // Check granular permission: deleteSession
  if (user.role !== "admin") {
    const perms = user.permissions ? (() => { try { return JSON.parse(user.permissions); } catch { return null; } })() : null;
    if (perms && Object.keys(perms).length > 0 && perms["deleteSession"] === false) {
      res.status(403).json({ error: "You do not have permission to delete sessions" });
      return;
    }
  }

  // Full cleanup: stop browser + delete token files from disk
  try {
    await deleteSessionFiles(id);
  } catch (e) {
    logger.warn({ sessionId: id, err: e }, "Error during session file cleanup");
  }

  const [session] = await db
    .delete(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await writeAuditLog({
    userId: user.id,
    username: user.username,
    action: "deleteSession",
    sessionId: id,
    details: { name: existing.name },
    ipAddress: req.ip,
  });

  res.sendStatus(204);
});

// POST /sessions/:id/connect
router.post("/sessions/:id/connect", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;

  if (isBrowserActive(id)) {
    res.json({ success: true, message: "Session browser already running. Scan the QR code." });
    return;
  }

  startSession(id).catch((e) => {
    logger.error({ sessionId: id, err: e }, "Background session start failed");
  });

  res.json({ success: true, message: "Connection initiated. Scan QR code." });
});

// POST /sessions/:id/disconnect
router.post("/sessions/:id/disconnect", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [session] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;

  await stopSession(id);
  res.json({ success: true, message: "Session disconnected" });
});

// GET /sessions/:id/qr
router.get("/sessions/:id/qr", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;

  const qr = getQrCode(id);
  res.json({ qr, status: session.status });
});

// GET /sessions/:id/stats
router.get("/sessions/:id/stats", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = (req as any).user;

  const [session] = await db
    .select()
    .from(whatsappSessionsTable)
    .where(eq(whatsappSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;

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
  const user = (req as any).user;

  const [session] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, session, res)) return;

  // Check granular permission: viewMessages
  if (user.role !== "admin") {
    const perms = user.permissions ? (() => { try { return JSON.parse(user.permissions); } catch { return null; } })() : null;
    if (perms && Object.keys(perms).length > 0 && perms["viewMessages"] === false) {
      res.status(403).json({ error: "You do not have permission to view messages" });
      return;
    }
  }

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
  const user = (req as any).user;

  const [existing] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, existing, res)) return;

  // Check granular permission: manageWebhook
  if (user.role !== "admin") {
    const perms = user.permissions ? (() => { try { return JSON.parse(user.permissions); } catch { return null; } })() : null;
    if (perms && Object.keys(perms).length > 0 && perms["manageWebhook"] === false) {
      res.status(403).json({ error: "You do not have permission to manage webhooks" });
      return;
    }
  }

  const { webhookUrl, webhookEvents, webhookSecret } = req.body;

  const [session] = await db
    .update(whatsappSessionsTable)
    .set({
      webhookUrl: webhookUrl ?? null,
      webhookEvents: webhookEvents ?? null,
      webhookSecret: webhookSecret ?? null,
    })
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
  const user = (req as any).user;

  const [existing] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!canAccessSession(user, existing, res)) return;

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
