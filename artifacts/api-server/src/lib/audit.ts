import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export async function writeAuditLog(params: {
  userId?: number | null;
  username?: string | null;
  action: string;
  sessionId?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: params.userId ?? null,
      username: params.username ?? null,
      action: params.action,
      sessionId: params.sessionId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to write audit log");
  }
}
