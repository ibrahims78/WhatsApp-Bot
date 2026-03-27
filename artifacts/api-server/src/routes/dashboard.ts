import { Router, type IRouter } from "express";
import { db, messagesTable, whatsappSessionsTable } from "@workspace/db";
import { gte, sql } from "drizzle-orm";
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

  // ── Use SQL aggregates instead of loading all sessions into memory ──────────
  const [sessionStats] = await db
    .select({
      totalSessions: sql<number>`count(*)::int`,
      connected: sql<number>`count(*) filter (where status = 'connected')::int`,
      totalSent: sql<number>`coalesce(sum(total_messages_sent), 0)::int`,
      totalReceived: sql<number>`coalesce(sum(total_messages_received), 0)::int`,
    })
    .from(whatsappSessionsTable);

  res.json({
    chartData,
    totalSessions: sessionStats?.totalSessions ?? 0,
    connected: sessionStats?.connected ?? 0,
    totalSent: sessionStats?.totalSent ?? 0,
    totalReceived: sessionStats?.totalReceived ?? 0,
  });
});

export default router;
