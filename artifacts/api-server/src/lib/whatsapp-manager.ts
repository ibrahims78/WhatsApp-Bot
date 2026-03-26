import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import path from "path";

// ── Chrome path ───────────────────────────────────────────────────────────────
const CHROME_PATH =
  "/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome";

function ensureChrome(): void {
  if (existsSync(CHROME_PATH)) return;
  logger.info("Chrome not found — downloading...");
  try {
    execSync("npx --yes puppeteer@24.40.0 browsers install chrome", {
      stdio: "pipe",
      timeout: 180_000,
    });
    logger.info("Chrome downloaded successfully");
  } catch (e) {
    logger.error({ err: e }, "Chrome download failed");
  }
}

// Remove stale Chrome lock files after crash/restart
function cleanChromeLock(sessionId: string): void {
  const tokensDir = path.join(process.cwd(), "tokens", sessionId);
  for (const lockName of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const lockFile = path.join(tokensDir, lockName);
    if (existsSync(lockFile)) {
      try {
        rmSync(lockFile, { force: true });
        logger.info({ sessionId, lockName }, "Removed stale Chrome lock file");
      } catch (e) {
        logger.warn({ sessionId, lockName, err: e }, "Could not remove lock file");
      }
    }
  }
}

// Force-kill any Chrome processes still using this session's profile directory
function forceKillBrowser(sessionId: string): void {
  try {
    execSync(`pkill -9 -f "tokens/${sessionId}" 2>/dev/null || true`, {
      stdio: "pipe",
      timeout: 5_000,
    });
  } catch {
    // ignore
  }
}

// ── State maps ────────────────────────────────────────────────────────────────
const clients         = new Map<string, any>();
const activeBrowsers  = new Set<string>();
const qrCodes         = new Map<string, string>();
const keepaliveIntervals = new Map<string, ReturnType<typeof setInterval>>();
const reconnectTimers    = new Map<string, ReturnType<typeof setTimeout>>();
const reconnectAttempts  = new Map<string, number>();
// Sessions that were intentionally stopped (do NOT auto-reconnect)
const stoppedSessions    = new Set<string>();
// Sessions that are in the process of being stopped (block concurrent connect)
const stoppingSessions   = new Set<string>();

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

  startSelfPing();
  return io;
}

export function emitToAll(event: string, data: object) {
  if (io) io.emit(event, data);
}

// ── Self-ping: keeps Replit container alive ───────────────────────────────────
function startSelfPing() {
  const PORT = process.env.PORT || 8080;
  setInterval(async () => {
    try { await fetch(`http://localhost:${PORT}/`); } catch { /* ignore */ }
  }, 30_000);
}

// ── Keepalive: pings the WhatsApp connection every 45s ───────────────────────
function startKeepalive(sessionId: string) {
  stopKeepalive(sessionId);
  const interval = setInterval(async () => {
    const client = clients.get(sessionId);
    if (!client) { stopKeepalive(sessionId); return; }
    try {
      const connected = await client.isConnected();
      if (!connected) {
        logger.warn({ sessionId }, "Keepalive: session not connected — scheduling reconnect");
        stopKeepalive(sessionId);
        scheduleReconnect(sessionId);
      } else {
        logger.debug({ sessionId }, "Keepalive ping OK");
      }
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Keepalive error — scheduling reconnect");
      stopKeepalive(sessionId);
      scheduleReconnect(sessionId);
    }
  }, 45_000);
  keepaliveIntervals.set(sessionId, interval);
  logger.info({ sessionId }, "Keepalive started (45s interval)");
}

function stopKeepalive(sessionId: string) {
  const interval = keepaliveIntervals.get(sessionId);
  if (interval) { clearInterval(interval); keepaliveIntervals.delete(sessionId); }
}

// ── Auto-reconnect with exponential backoff ───────────────────────────────────
function scheduleReconnect(sessionId: string) {
  if (stoppedSessions.has(sessionId)) {
    logger.info({ sessionId }, "Session was manually stopped — skipping auto-reconnect");
    return;
  }

  const existing = reconnectTimers.get(sessionId);
  if (existing) clearTimeout(existing);

  const attempt = (reconnectAttempts.get(sessionId) || 0) + 1;
  reconnectAttempts.set(sessionId, attempt);

  const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 120_000);
  logger.info({ sessionId, attempt, delayMs: delay }, "Scheduling auto-reconnect");
  emitToAll("status", { sessionId, status: "reconnecting", attempt });

  const timer = setTimeout(async () => {
    reconnectTimers.delete(sessionId);
    if (stoppedSessions.has(sessionId)) return;

    logger.info({ sessionId, attempt }, "Attempting auto-reconnect");
    try {
      activeBrowsers.delete(sessionId);
      clients.delete(sessionId);
      await startSession(sessionId);
      reconnectAttempts.delete(sessionId);
      logger.info({ sessionId }, "Auto-reconnect succeeded");
    } catch (e) {
      logger.error({ sessionId, attempt, err: e }, "Auto-reconnect failed — will retry");
      scheduleReconnect(sessionId);
    }
  }, delay);

  reconnectTimers.set(sessionId, timer);
}

// ── Phone number fetch with retry ─────────────────────────────────────────────
async function fetchPhoneNumber(client: any, sessionId: string, maxRetries = 8): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    // Wait before each attempt — connection needs to fully sync first
    await new Promise((r) => setTimeout(r, 3_000));
    try {
      const info = await client.getHostDevice();
      const phone = info?.wid?.user || null;
      if (phone) {
        await db
          .update(whatsappSessionsTable)
          .set({ phoneNumber: phone })
          .where(eq(whatsappSessionsTable.id, sessionId));
        emitToAll("phoneNumber", { sessionId, phoneNumber: phone });
        logger.info({ sessionId, phone }, "Phone number saved");
        return;
      }
    } catch (e) {
      logger.debug({ sessionId, attempt: i + 1 }, "getHostDevice not ready yet — retrying");
    }
  }
  logger.warn({ sessionId }, "Could not retrieve phone number after all retries");
}

// ── Core: start session ───────────────────────────────────────────────────────
export async function startSession(sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info({ sessionId }, "Session already active");
    return;
  }

  if (activeBrowsers.has(sessionId)) {
    logger.info({ sessionId }, "Browser already running for this session");
    return;
  }

  // Block if still in the middle of stopping
  if (stoppingSessions.has(sessionId)) {
    logger.warn({ sessionId }, "Session is still stopping — waiting");
    await new Promise((r) => setTimeout(r, 3_000));
  }

  // Mark as intentionally started (clear stopped flag)
  stoppedSessions.delete(sessionId);
  activeBrowsers.add(sessionId);

  // Always clean lock files before launching to avoid "profile in use" errors
  cleanChromeLock(sessionId);
  ensureChrome();

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

      catchQR: async (base64QR: string, _ascii: string, attempts: number) => {
        logger.info({ sessionId, attempts }, "QR code generated");
        qrCodes.set(sessionId, base64QR);
        emitToAll("qr", { sessionId, qr: base64QR });
      },

      statusFind: async (status: string) => {
        logger.info({ sessionId, status }, "Session status changed");

        // ── Fully connected (QR scan) ──
        if (status === "qrReadSuccess") {
          await db
            .update(whatsappSessionsTable)
            .set({ status: "connected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          qrCodes.delete(sessionId);
          reconnectAttempts.delete(sessionId);
          emitToAll("status", { sessionId, status: "connected" });
          startKeepalive(sessionId);

          // Fetch phone number in background — wait for sync to complete
          fetchPhoneNumber(client, sessionId).catch((e) =>
            logger.warn({ sessionId, err: e }, "fetchPhoneNumber background error")
          );
        }

        // ── Already logged in via saved token ──
        else if (status === "isLogged") {
          await db
            .update(whatsappSessionsTable)
            .set({ status: "connected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          qrCodes.delete(sessionId);
          reconnectAttempts.delete(sessionId);
          emitToAll("status", { sessionId, status: "connected" });
          startKeepalive(sessionId);

          fetchPhoneNumber(client, sessionId).catch((e) =>
            logger.warn({ sessionId, err: e }, "fetchPhoneNumber background error")
          );
        }

        // ── Browser fully closed ──
        else if (status === "browserClose" || status === "autocloseCalled") {
          stopKeepalive(sessionId);
          activeBrowsers.delete(sessionId);
          clients.delete(sessionId);
          qrCodes.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "disconnected" });
          scheduleReconnect(sessionId);
        }

        // ── QR waiting ──
        else if (status === "notLogged") {
          await db
            .update(whatsappSessionsTable)
            .set({ status: "notLogged" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "notLogged" });
        }

        // ── Phone disconnected from device side ──
        else if (
          status === "desconnectedMobile" ||
          status === "disconnectedMobile"
        ) {
          if (stoppedSessions.has(sessionId)) {
            logger.info({ sessionId }, "disconnectedMobile — session was manually stopped, ignoring");
            return;
          }
          logger.warn({ sessionId }, "Phone disconnected — scheduling reconnect");
          stopKeepalive(sessionId);
          activeBrowsers.delete(sessionId);
          clients.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          emitToAll("status", { sessionId, status: "disconnected" });
          scheduleReconnect(sessionId);
        }
        // inChat, isLogin, chatsAvailable, SYNCING — intermediate states, ignore
      },
    });

    clients.set(sessionId, client);

    // ── Incoming message listener ─────────────────────────────────────────────
    client.onMessage(async (message: any) => {
      try {
        if (message.fromMe === true) return;

        const from: string = message.from || "";
        if (from === "status@broadcast" || from.endsWith("@newsletter")) return;

        const session = await db.query.whatsappSessionsTable.findFirst({
          where: eq(whatsappSessionsTable.id, sessionId),
        });
        if (!session) return;

        const stripSuffix = (n: string) =>
          n?.replace(/@(c\.us|lid|g\.us)$/, "") || "";

        await db.insert(messagesTable).values({
          sessionId,
          direction: "inbound",
          fromNumber: stripSuffix(message.from || ""),
          toNumber:   stripSuffix(message.to   || ""),
          messageType: message.type || "text",
          content:   message.body  || null,
          mediaUrl:  null,
          caption:   message.caption || null,
          status:    "delivered",
          timestamp: new Date(message.timestamp * 1000),
        });

        await db
          .update(whatsappSessionsTable)
          .set({
            totalMessagesReceived:
              sql`${whatsappSessionsTable.totalMessagesReceived} + 1`,
          })
          .where(eq(whatsappSessionsTable.id, sessionId));

        emitToAll("message", { sessionId, message });

        if (session.webhookUrl) {
          let events: string[] = [];
          try {
            events = session.webhookEvents ? JSON.parse(session.webhookEvents) : [];
          } catch {
            logger.warn({ sessionId }, "webhookEvents is invalid JSON");
          }

          if (events.includes("message.received") || events.length === 0) {
            const rawFrom  = message.from || "";
            const phoneNumber = rawFrom.includes("@")
              ? rawFrom.split("@")[0]
              : rawFrom;

            triggerWebhook(session.webhookUrl, {
              event: "message.received",
              sessionId,
              data: {
                type:        message.type || "chat",
                from:        rawFrom,
                phoneNumber,
                to:          message.to   || "",
                body:        message.body || "",
                timestamp:   message.timestamp || Math.floor(Date.now() / 1000),
                mediaUrl:    message.mediaUrl  || null,
                fileName:    message.fileName  || null,
                caption:     message.caption   || null,
                mimetype:    message.mimetype  || null,
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

// ── Core: stop session ────────────────────────────────────────────────────────
export async function stopSession(sessionId: string): Promise<void> {
  stoppedSessions.add(sessionId);
  stoppingSessions.add(sessionId);

  // Cancel pending reconnect
  const timer = reconnectTimers.get(sessionId);
  if (timer) { clearTimeout(timer); reconnectTimers.delete(sessionId); }
  reconnectAttempts.delete(sessionId);

  stopKeepalive(sessionId);
  activeBrowsers.delete(sessionId);

  const client = clients.get(sessionId);
  if (client) {
    // 1. Try graceful close via WPPConnect
    try { await client.close(); } catch (e) {
      logger.warn({ sessionId, err: e }, "client.close() error (will force kill)");
    }

    // 2. Kill the underlying Puppeteer browser if it survived
    try {
      const browser = client.browser;
      if (browser) {
        const proc = browser.process?.();
        if (proc) proc.kill("SIGKILL");
        await browser.close().catch(() => {});
      }
    } catch { /* ignore */ }

    clients.delete(sessionId);
  }

  // 3. Force-kill any lingering Chrome processes for this session
  forceKillBrowser(sessionId);

  // 4. Clean up lock files so the next connect can launch cleanly
  cleanChromeLock(sessionId);

  qrCodes.delete(sessionId);
  stoppingSessions.delete(sessionId);

  await db
    .update(whatsappSessionsTable)
    .set({ status: "disconnected" })
    .where(eq(whatsappSessionsTable.id, sessionId));

  emitToAll("status", { sessionId, status: "disconnected" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
        logger.info({ url, status: res.status }, "Webhook delivered");
      } else {
        logger.warn({ url, status: res.status }, "Webhook returned non-OK status");
      }
    })
    .catch((e) => logger.warn({ url, err: e }, "Webhook delivery failed"));
}
