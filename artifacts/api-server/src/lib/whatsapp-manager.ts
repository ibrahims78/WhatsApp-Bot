import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

// Map of session ID to WPPConnect client (only set after create() resolves)
const clients = new Map<string, any>();
// Set of session IDs that have an active browser process running
const activeBrowsers = new Set<string>();
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

  if (activeBrowsers.has(sessionId)) {
    logger.info({ sessionId }, "Browser already running for this session");
    return;
  }

  activeBrowsers.add(sessionId);

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
        } else if (status === "browserClose" || status === "autocloseCalled") {
          // Browser was fully closed — clean everything up
          activeBrowsers.delete(sessionId);
          clients.delete(sessionId);
          qrCodes.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "disconnected" });
        } else if (status === "notLogged") {
          // QR is ready to scan — keep browser alive, just notify frontend
          await db
            .update(whatsappSessionsTable)
            .set({ status: "notLogged" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "notLogged" });
        }
        // disconnectedMobile, inChat, isLogin are intermediate states — do NOT clean up browser
      },
    });

    clients.set(sessionId, client);

    // Setup message listener
    client.onMessage(async (message: any) => {
      try {
        const session = await db.query.whatsappSessionsTable.findFirst({
          where: eq(whatsappSessionsTable.id, sessionId),
        });

        if (!session) return;

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

        await db
          .update(whatsappSessionsTable)
          .set({ totalMessagesReceived: sql`${whatsappSessionsTable.totalMessagesReceived} + 1` })
          .where(eq(whatsappSessionsTable.id, sessionId));

        emitToAll("message", { sessionId, message });

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
    activeBrowsers.delete(sessionId);
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
  activeBrowsers.delete(sessionId);
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

export function isBrowserActive(sessionId: string): boolean {
  return activeBrowsers.has(sessionId) || clients.has(sessionId);
}

function triggerWebhook(url: string, payload: object) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((e) => logger.warn({ url, err: e }, "Webhook delivery failed"));
}
