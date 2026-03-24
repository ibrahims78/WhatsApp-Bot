import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

// Map of session ID to WPPConnect client
const clients = new Map<string, any>();
// Set of session IDs currently being started (to prevent duplicate launches)
const pendingSessions = new Set<string>();
// Map of session ID to current QR code
const qrCodes = new Map<string, string>();

let io: SocketServer;

export function initSocketServer(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "WebSocket client connected");
    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "WebSocket client disconnected");
    });
  });

  return io;
}

export function emitToAll(event: string, data: object) {
  if (io) {
    io.emit(event, data);
  }
}

export async function startSession(sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info({ sessionId }, "Session already active");
    return;
  }

  if (pendingSessions.has(sessionId)) {
    logger.info({ sessionId }, "Session start already in progress");
    return;
  }

  pendingSessions.add(sessionId);

  // Update status to connecting
  await db
    .update(whatsappSessionsTable)
    .set({ status: "connecting" })
    .where(eq(whatsappSessionsTable.id, sessionId));

  emitToAll("status", { sessionId, status: "connecting" });

  try {
    const client = await create({
      session: sessionId,
      headless: true,
      autoClose: false,
      disableWelcome: true,
      logQR: false,
      // Use the puppeteer-downloaded Chrome in the Replit environment
      executablePath: "/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome",
      puppeteerOptions: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
      },
      catchQR: async (base64QR: string, asciiQR: string, attempts: number) => {
        logger.info({ sessionId, attempts }, "QR code generated");
        qrCodes.set(sessionId, base64QR);
        emitToAll("qr", { sessionId, qr: base64QR });
      },
      statusFind: async (status: string) => {
        logger.info({ sessionId, status }, "Session status changed");

        if (status === "isLogged" || status === "qrReadSuccess") {
          await db
            .update(whatsappSessionsTable)
            .set({ status: "connected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          qrCodes.delete(sessionId);
          emitToAll("status", { sessionId, status: "connected" });

          // Get phone number
          try {
            const info = await client.getHostDevice();
            const phone = info?.wid?.user || null;
            if (phone) {
              await db
                .update(whatsappSessionsTable)
                .set({ phoneNumber: phone })
                .where(eq(whatsappSessionsTable.id, sessionId));
            }
          } catch (e) {
            logger.warn({ sessionId }, "Could not get phone number");
          }
        } else if (status === "disconnectedMobile" || status === "disconnected" || status === "browserClose") {
          // Truly disconnected — clean up and notify frontend
          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          clients.delete(sessionId);
          pendingSessions.delete(sessionId);
          emitToAll("status", { sessionId, status: "disconnected" });
        }
        // notLogged / inChat / isLogin are intermediate states during QR scan — ignore
      },
    });

    clients.set(sessionId, client);
    pendingSessions.delete(sessionId);

    // Setup message listener
    client.onMessage(async (message: any) => {
      try {
        const session = await db.query.whatsappSessionsTable.findFirst({
          where: eq(whatsappSessionsTable.id, sessionId),
        });

        if (!session) return;

        // Save message to DB
        await db.insert(messagesTable).values({
          sessionId,
          direction: "inbound",
          fromNumber: message.from?.replace("@c.us", "") || "",
          toNumber: message.to?.replace("@c.us", "") || "",
          messageType: message.type || "text",
          content: message.body || null,
          mediaUrl: null,
          caption: message.caption || null,
          status: "delivered",
          timestamp: new Date(message.timestamp * 1000),
        });

        // Update received count
        await db
          .update(whatsappSessionsTable)
          .set({ totalMessagesReceived: sql`${whatsappSessionsTable.totalMessagesReceived} + 1` })
          .where(eq(whatsappSessionsTable.id, sessionId));

        // Emit to dashboard
        emitToAll("message", { sessionId, message });

        // Send to webhook if configured
        if (session.webhookUrl) {
          const events = session.webhookEvents ? JSON.parse(session.webhookEvents) : [];
          if (events.includes("message.received") || events.length === 0) {
            triggerWebhook(session.webhookUrl, {
              event: "message.received",
              sessionId,
              message,
            });
          }
        }
      } catch (e) {
        logger.error({ sessionId, err: e }, "Error handling incoming message");
      }
    });
  } catch (e) {
    pendingSessions.delete(sessionId);
    logger.error({ sessionId, err: e }, "Failed to start WhatsApp session");
    await db
      .update(whatsappSessionsTable)
      .set({ status: "disconnected" })
      .where(eq(whatsappSessionsTable.id, sessionId));
    emitToAll("status", { sessionId, status: "disconnected" });
    throw e;
  }
}

export async function stopSession(sessionId: string): Promise<void> {
  pendingSessions.delete(sessionId);
  const client = clients.get(sessionId);
  if (client) {
    try {
      await client.close();
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Error closing session");
    }
    clients.delete(sessionId);
  }
  qrCodes.delete(sessionId);

  await db
    .update(whatsappSessionsTable)
    .set({ status: "disconnected" })
    .where(eq(whatsappSessionsTable.id, sessionId));

  emitToAll("status", { sessionId, status: "disconnected" });
}

export function getClient(sessionId: string) {
  return clients.get(sessionId) || null;
}

export function getQrCode(sessionId: string): string | null {
  return qrCodes.get(sessionId) || null;
}

function triggerWebhook(url: string, payload: object) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((e) => logger.warn({ url, err: e }, "Webhook delivery failed"));
}
