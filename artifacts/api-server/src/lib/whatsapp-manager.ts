import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import path from "path";

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

// Remove stale Chrome profile lock files that prevent browser from launching
// after a crash or hard restart (the "profile in use" error).
function cleanChromeLock(sessionId: string): void {
  const tokensDir = path.join(process.cwd(), "tokens", sessionId);
  const lockFile = path.join(tokensDir, "SingletonLock");
  if (existsSync(lockFile)) {
    try {
      rmSync(lockFile, { force: true });
      logger.info({ sessionId }, "Removed stale Chrome SingletonLock");
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Could not remove SingletonLock");
    }
  }
}

// Map of session ID to WPPConnect client (only set after create() resolves)
const clients = new Map<string, any>();
// Set of session IDs that have an active browser process running
const activeBrowsers = new Set<string>();
// Map of session ID to current QR code
const qrCodes = new Map<string, string>();
// Map of session ID to keepalive interval handle
const keepaliveIntervals = new Map<string, ReturnType<typeof setInterval>>();
// Map of session ID to reconnect timer handle
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Map of session ID to reconnect attempt count (for backoff)
const reconnectAttempts = new Map<string, number>();
// Track sessions that were intentionally stopped (should NOT auto-reconnect)
const stoppedSessions = new Set<string>();

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

  // Self-ping every 30 seconds to prevent Replit from idling the container
  startSelfPing();

  return io;
}

export function emitToAll(event: string, data: object) {
  if (io) {
    io.emit(event, data);
  }
}

// ── Self-ping: keeps Replit container alive ──────────────────────────────────
function startSelfPing() {
  const PORT = process.env.PORT || 8080;
  setInterval(async () => {
    try {
      await fetch(`http://localhost:${PORT}/`);
    } catch {
      // ignore — server might not respond to /, that's fine
    }
  }, 30_000);
}

// ── Keepalive: pings the WhatsApp connection to prevent timeout ──────────────
function startKeepalive(sessionId: string) {
  stopKeepalive(sessionId);

  const interval = setInterval(async () => {
    const client = clients.get(sessionId);
    if (!client) {
      stopKeepalive(sessionId);
      return;
    }
    try {
      const connected = await client.isConnected();
      if (connected) {
        logger.debug({ sessionId }, "Keepalive ping OK");
      } else {
        logger.warn({ sessionId }, "Keepalive ping failed — session not connected, scheduling reconnect");
        stopKeepalive(sessionId);
        scheduleReconnect(sessionId);
      }
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Keepalive check threw error — scheduling reconnect");
      stopKeepalive(sessionId);
      scheduleReconnect(sessionId);
    }
  }, 45_000); // every 45 seconds

  keepaliveIntervals.set(sessionId, interval);
  logger.info({ sessionId }, "Keepalive started (45s interval)");
}

function stopKeepalive(sessionId: string) {
  const interval = keepaliveIntervals.get(sessionId);
  if (interval) {
    clearInterval(interval);
    keepaliveIntervals.delete(sessionId);
  }
}

// ── Auto-reconnect with exponential backoff ───────────────────────────────────
function scheduleReconnect(sessionId: string) {
  if (stoppedSessions.has(sessionId)) {
    logger.info({ sessionId }, "Session was manually stopped — skipping auto-reconnect");
    return;
  }

  // Cancel any pending reconnect timer
  const existing = reconnectTimers.get(sessionId);
  if (existing) clearTimeout(existing);

  const attempt = (reconnectAttempts.get(sessionId) || 0) + 1;
  reconnectAttempts.set(sessionId, attempt);

  // Exponential backoff: 5s, 10s, 20s, 40s … max 120s
  const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 120_000);

  logger.info({ sessionId, attempt, delayMs: delay }, "Scheduling auto-reconnect");
  emitToAll("status", { sessionId, status: "reconnecting", attempt });

  const timer = setTimeout(async () => {
    reconnectTimers.delete(sessionId);

    if (stoppedSessions.has(sessionId)) return;

    logger.info({ sessionId, attempt }, "Attempting auto-reconnect");
    try {
      // Clean up stale state before reconnecting
      activeBrowsers.delete(sessionId);
      clients.delete(sessionId);
      await startSession(sessionId);
      reconnectAttempts.delete(sessionId); // reset counter on success
      logger.info({ sessionId }, "Auto-reconnect succeeded");
    } catch (e) {
      logger.error({ sessionId, attempt, err: e }, "Auto-reconnect failed — will retry");
      scheduleReconnect(sessionId);
    }
  }, delay);

  reconnectTimers.set(sessionId, timer);
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

  // Mark as intentionally started (clear stopped flag)
  stoppedSessions.delete(sessionId);

  activeBrowsers.add(sessionId);

  // Remove stale Chrome lock that can remain after a crash or restart
  cleanChromeLock(sessionId);

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
      autoClose: 0,
      deviceSyncTimeout: 0,
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
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
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
          reconnectAttempts.delete(sessionId); // reset backoff on successful connect
          emitToAll("status", { sessionId, status: "connected" });

          // Start keepalive to maintain the connection
          startKeepalive(sessionId);

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
          // Browser was fully closed — clean up and attempt reconnect
          stopKeepalive(sessionId);
          activeBrowsers.delete(sessionId);
          clients.delete(sessionId);
          qrCodes.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "disconnected" });

          // Auto-reconnect unless manually stopped
          scheduleReconnect(sessionId);
        } else if (status === "notLogged") {
          // QR is ready to scan — keep browser alive, just notify frontend
          await db
            .update(whatsappSessionsTable)
            .set({ status: "notLogged" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "notLogged" });
        } else if (status === "desconnectedMobile" || status === "disconnectedMobile") {
          // Phone-side disconnect — attempt reconnect
          logger.warn({ sessionId }, "Phone disconnected — will attempt reconnect");
          stopKeepalive(sessionId);
          emitToAll("status", { sessionId, status: "disconnected" });

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          scheduleReconnect(sessionId);
        }
        // inChat, isLogin, chatsAvailable are intermediate states — do NOT clean up
      },
    });

    clients.set(sessionId, client);

    // Setup message listener — only for INCOMING messages (fromMe === false)
    client.onMessage(async (message: any) => {
      try {
        // Skip messages sent BY this session (outbound already logged in send routes)
        if (message.fromMe === true) return;

        // Ignore status broadcasts and newsletter channels — not real person messages
        const from: string = message.from || "";
        if (from === "status@broadcast" || from.endsWith("@newsletter")) return;

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
          let events: string[] = [];
          if (session.webhookEvents) {
            try {
              events = JSON.parse(session.webhookEvents);
            } catch {
              logger.warn({ sessionId }, "webhookEvents is not valid JSON — treating as empty (fire all)");
            }
          }
          if (events.includes("message.received") || events.length === 0) {
            logger.info({ sessionId, webhookUrl: session.webhookUrl, from: message.from }, "Firing webhook for incoming message");
            const rawFrom: string = message.from || "";
            const phoneNumber = rawFrom.includes("@") ? rawFrom.split("@")[0] : rawFrom;

            triggerWebhook(session.webhookUrl, {
              event: "message.received",
              sessionId,
              data: {
                type: message.type || "chat",
                from: rawFrom,
                phoneNumber,
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
        } else {
          logger.debug({ sessionId }, "Incoming message received but no webhook URL configured");
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
  // Mark as intentionally stopped so auto-reconnect does NOT trigger
  stoppedSessions.add(sessionId);

  // Cancel any pending reconnect
  const timer = reconnectTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(sessionId);
  }
  reconnectAttempts.delete(sessionId);

  // Stop keepalive
  stopKeepalive(sessionId);

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
  })
    .then((res) => {
      if (res.ok) {
        logger.info({ url, status: res.status }, "Webhook delivered successfully");
      } else {
        logger.warn({ url, status: res.status }, "Webhook returned non-OK status");
      }
    })
    .catch((e) => logger.warn({ url, err: e }, "Webhook delivery failed"));
}
