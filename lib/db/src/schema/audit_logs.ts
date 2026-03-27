import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // null = system action
  username: text("username"), // denormalized for display even after user deletion
  action: text("action").notNull(), // e.g. sendText, createSession, deleteSession, login
  sessionId: text("session_id"), // optional, which WhatsApp session was involved
  details: text("details"), // JSON string with extra context
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  timestamp: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
