import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocketServer, initializeSessions } from "./lib/whatsapp-manager";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./lib/auth";

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

  // Create a default admin user only if no admin users exist in the database.
  // This ensures user changes (username, password) are preserved across restarts.
  try {
    const adminUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (adminUsers.length === 0) {
      const adminPassword = "123456";
      const passwordHash = hashPassword(adminPassword);
      await db.insert(usersTable).values({
        username: "admin",
        email: "admin@example.com",
        passwordHash,
        role: "admin",
        isActive: true,
        mustChangePassword: true,
      });
      logger.info("Default admin user created: admin / 123456");
    } else {
      logger.info(`Admin user(s) already exist — skipping seed`);
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
