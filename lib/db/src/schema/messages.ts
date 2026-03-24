import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  direction: text("direction").notNull(), // inbound | outbound
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  messageType: text("message_type").notNull().default("text"), // text | image | video | audio | file | sticker | location | contact
  content: text("content"),
  mediaUrl: text("media_url"),
  caption: text("caption"),
  status: text("status").notNull().default("sent"), // sent | delivered | read | failed
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
