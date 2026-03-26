import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { execSync } from "child_process";
import { existsSync } from "fs";

// ── Resolve Chrome path — auto-download if missing ──────────────────────────
const CHROME_PATH =
  "/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome";

function ensureChrome(): void {
  if (existsSync(CHROME_PATH)) return;
  logger.info("Chrome not found — downloading (this may take 1-2 minutes)...");
  try {
    execSync("npx --yes puppeteer@24.40.0 browsers install chrome", {
      stdio: "pipe",
      timeout: 180_000,
    });
    logger.info("Chrome downloaded successfully");
  } catch (e) {
    logger.error({ err: e }, "Chrome download failed — sessions will not work");
  }
}

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

  // Ensure Chrome is downloaded before launching
  ensureChrome();

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
      executablePath: CHROME_PATH,
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
          "--disable-extensions",
          "--disable-default-apps",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-sync",
          "--disable-translate",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-client-side-phishing-detection",
          "--disable-popup-blocking",
          "--mute-audio",
          "--password-store=basic",
          "--use-mock-keychain",
          "--force-color-profile=srgb",
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

        // Strip all WhatsApp suffixes (@c.us, @lid, @g.us) for storage
        const stripSuffix = (n: string) => n?.replace(/@(c\.us|lid|g\.us)$/, "") || "";
        await db.insert(messagesTable).values({
          sessionId,
          direction: "inbound",
          fromNumber: stripSuffix(message.from || ""),
          toNumber: stripSuffix(message.to || ""),
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
              data: {
                type: message.type || "chat",
                from: message.from || "",
                to: message.to || "",
                body: message.body || "",
                timestamp: message.timestamp || Math.floor(Date.now() / 1000),
                mediaUrl: message.mediaUrl || null,
                fileName: message.fileName || null,
                caption: message.caption || null,
                mimetype: message.mimetype || null,
              },
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
