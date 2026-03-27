import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// GET /audit-logs (admin only)
router.get("/audit-logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) || "100", 10), 500);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(limit)
    .offset(offset);

  res.json(logs);
});

export default router;
