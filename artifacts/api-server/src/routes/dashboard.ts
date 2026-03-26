import { Router, type IRouter } from "express";
import { db, messagesTable, whatsappSessionsTable } from "@workspace/db";
import { eq, gte, sql, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /dashboard/stats — returns real data for the last 7 days
router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Messages per day for the last 7 days grouped by direction
  const rows = await db
    .select({
      day: sql<string>`to_char(${messagesTable.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      direction: messagesTable.direction,
      count: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(gte(messagesTable.timestamp, sevenDaysAgo))
    .groupBy(
      sql`to_char(${messagesTable.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      messagesTable.direction
    )
    .orderBy(sql`to_char(${messagesTable.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

  // Build a map of day -> { sent, received }
  const dayMap: Record<string, { sent: number; received: number }> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { sent: 0, received: 0 };
  }

  for (const row of rows) {
    if (!dayMap[row.day]) continue;
    if (row.direction === "outbound") {
      dayMap[row.day].sent = row.count;
    } else {
      dayMap[row.day].received = row.count;
    }
  }

  const chartData = Object.entries(dayMap).map(([date, counts]) => ({
    date,
    sent: counts.sent,
    received: counts.received,
  }));

  // Total sessions counts
  const sessions = await db.select().from(whatsappSessionsTable);
  const totalSessions = sessions.length;
  const connected = sessions.filter((s) => s.status === "connected").length;
  const totalSent = sessions.reduce((acc, s) => acc + s.totalMessagesSent, 0);
  const totalReceived = sessions.reduce((acc, s) => acc + s.totalMessagesReceived, 0);

  res.json({ chartData, totalSessions, connected, totalSent, totalReceived });
});

export default router;
