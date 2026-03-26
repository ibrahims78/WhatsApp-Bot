import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocketServer, initializeSessions } from "./lib/whatsapp-manager";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

// Initialize WebSocket server
initSocketServer(httpServer);

httpServer.listen(port, async () => {
  logger.info({ port }, "Server listening");

  // Ensure default admin user always exists with the fixed credentials on every startup
  try {
    const adminPassword = "123456";
    const passwordHash = hashPassword(adminPassword);
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "admin"));

    if (!existing) {
      await db.insert(usersTable).values({
        username: "admin",
        email: "admin@example.com",
        passwordHash,
        role: "admin",
        isActive: true,
      });
      logger.info("Default admin user created: admin / 123456");
    } else {
      await db
        .update(usersTable)
        .set({ passwordHash, role: "admin", isActive: true })
        .where(eq(usersTable.username, "admin"));
      logger.info("Default admin user ensured: admin / 123456");
    }
  } catch (e) {
    logger.error({ err: e }, "Failed to seed admin user");
  }

  // Auto-start all WhatsApp sessions saved in DB.
  // This ensures sessions reconnect automatically after any server restart.
  // Delay by 3s to let the server fully stabilize first.
  setTimeout(() => {
    initializeSessions().catch((e) =>
      logger.error({ err: e }, "initializeSessions failed")
    );
  }, 3_000);
});
