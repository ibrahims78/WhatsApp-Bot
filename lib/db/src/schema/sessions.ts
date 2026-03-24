import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappSessionsTable = pgTable("whatsapp_sessions", {
  id: text("id").primaryKey(), // e.g. "session_001"
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  status: text("status").notNull().default("disconnected"), // disconnected | connecting | connected | banned
  webhookUrl: text("webhook_url"),
  webhookEvents: text("webhook_events"), // JSON array of event names
  features: text("features"), // JSON object of feature flags
  totalMessagesSent: integer("total_messages_sent").notNull().default(0),
  totalMessagesReceived: integer("total_messages_received").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionSchema = createInsertSchema(whatsappSessionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type WhatsAppSession = typeof whatsappSessionsTable.$inferSelect;
