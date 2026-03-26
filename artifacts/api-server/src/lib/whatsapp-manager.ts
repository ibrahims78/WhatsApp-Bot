import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { execSync, spawnSync } from "child_process";
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

function cleanChromeLocks(sessionId: string): void {
  const tokensDir = path.join(process.cwd(), "tokens", sessionId);
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const f = path.join(tokensDir, name);
    if (existsSync(f)) {
      try { rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  }
}

function forceKillChrome(sessionId: string): void {
  try {
    spawnSync("pkill", ["-9", "-f", `tokens/${sessionId}`], { timeout: 3_000 });
  } catch { /* ignore */ }
}

// ── State ─────────────────────────────────────────────────────────────────────
// Maps sessionId → WPPConnect client object
const clients = new Map<string, any>();
// Sessions currently launching a browser (prevent double-start)
const launching = new Set<string>();
// Sessions that were manually stopped (block auto-reconnect)
const manuallyStopped = new Set<string>();
// Sessions that are currently stopping (block concurrent connect)
const stopping = new Set<string>();
// QR codes
const qrCodes = new Map<string, string>();
// Keepalive timers
const keepaliveTimers = new Map<string, ReturnType<typeof setInterval>>();
// Reconnect timers
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Reconnect attempt count (for backoff)
const reconnectCount = new Map<string, number>();
// Timestamp of last successful connection (to filter stale disconnect events)
const lastConnectedAt = new Map<string, number>();

let io: SocketServer;

// ── Socket server ─────────────────────────────────────────────────────────────
export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });
  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "WebSocket client connected");
    socket.on("disconnect", () =>
      logger.info({ socketId: socket.id }, "WebSocket client disconnected")
    );
  });
  startSelfPing();
  return io;
}

export function emitToAll(event: string, data: object): void {
  io?.emit(event, data);
}

// ── Self-ping: prevents Replit container idle ─────────────────────────────────
function startSelfPing(): void {
  const PORT = process.env.PORT || 8080;
  setInterval(async () => {
    try { await fetch(`http://localhost:${PORT}/`); } catch { /* ignore */ }
  }, 30_000);
}

// ── Keepalive: verify WA connection every 45s ─────────────────────────────────
function startKeepalive(sessionId: string): void {
  stopKeepalive(sessionId);
  const t = setInterval(async () => {
    const client = clients.get(sessionId);
    if (!client) { stopKeepalive(sessionId); return; }
    try {
      const ok = await client.isConnected();
      if (!ok) {
        logger.warn({ sessionId }, "Keepalive: not connected — reconnecting");
        stopKeepalive(sessionId);
        scheduleReconnect(sessionId);
      }
    } catch {
      logger.warn({ sessionId }, "Keepalive error — reconnecting");
      stopKeepalive(sessionId);
      scheduleReconnect(sessionId);
    }
  }, 45_000);
  keepaliveTimers.set(sessionId, t);
}

function stopKeepalive(sessionId: string): void {
  const t = keepaliveTimers.get(sessionId);
  if (t) { clearInterval(t); keepaliveTimers.delete(sessionId); }
}

// ── Auto-reconnect ────────────────────────────────────────────────────────────
function cancelReconnect(sessionId: string): void {
  const t = reconnectTimers.get(sessionId);
  if (t) { clearTimeout(t); reconnectTimers.delete(sessionId); }
}

function scheduleReconnect(sessionId: string): void {
  if (manuallyStopped.has(sessionId)) return;
  cancelReconnect(sessionId);

  const attempt = (reconnectCount.get(sessionId) ?? 0) + 1;
  reconnectCount.set(sessionId, attempt);
  const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 120_000);

  logger.info({ sessionId, attempt, delayMs: delay }, "Reconnect scheduled");
  emitToAll("status", { sessionId, status: "reconnecting", attempt });

  const t = setTimeout(async () => {
    reconnectTimers.delete(sessionId);
    if (manuallyStopped.has(sessionId)) return;

    // Don't launch if something is already running for this session
    if (clients.has(sessionId) || launching.has(sessionId)) {
      logger.info({ sessionId }, "Reconnect skipped — session already active");
      reconnectCount.delete(sessionId);
      return;
    }

    logger.info({ sessionId, attempt }, "Auto-reconnect starting");
    try {
      await startSession(sessionId);
      reconnectCount.delete(sessionId);
    } catch (e) {
      logger.error({ sessionId, attempt, err: e }, "Auto-reconnect failed");
      scheduleReconnect(sessionId);
    }
  }, delay);

  reconnectTimers.set(sessionId, t);
}

// ── Phone number fetch with retry ─────────────────────────────────────────────
async function fetchPhoneNumber(sessionId: string, maxRetries = 10): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 3_000));
    const client = clients.get(sessionId); // always fresh reference
    if (!client) return; // session was stopped
    try {
      const info = await client.getHostDevice();
      const phone: string | null = info?.wid?.user ?? null;
      if (phone) {
        await db
          .update(whatsappSessionsTable)
          .set({ phoneNumber: phone })
          .where(eq(whatsappSessionsTable.id, sessionId));
        emitToAll("phoneNumber", { sessionId, phoneNumber: phone });
        logger.info({ sessionId, phone }, "Phone number saved");
        return;
      }
    } catch {
      logger.debug({ sessionId, attempt: i + 1 }, "getHostDevice not ready — retrying");
    }
  }
  logger.warn({ sessionId }, "Could not retrieve phone number after retries");
}

// ── Start session ─────────────────────────────────────────────────────────────
export async function startSession(sessionId: string): Promise<void> {
  // Prevent double-launch
  if (clients.has(sessionId)) {
    logger.info({ sessionId }, "Session already connected");
    return;
  }
  if (launching.has(sessionId)) {
    logger.info({ sessionId }, "Session already launching");
    return;
  }
  if (stopping.has(sessionId)) {
    logger.warn({ sessionId }, "Session still stopping — waiting 2s");
    await new Promise((r) => setTimeout(r, 2_000));
    if (stopping.has(sessionId)) {
      logger.error({ sessionId }, "Session still stopping after wait — aborting");
      return;
    }
  }

  manuallyStopped.delete(sessionId);
  launching.add(sessionId);

  // Clean up any leftover lock files and lingering Chrome
  forceKillChrome(sessionId);
  await new Promise((r) => setTimeout(r, 500)); // short pause after kill
  cleanChromeLocks(sessionId);
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
        logger.info({ sessionId, status }, "WPPConnect status");

        // ── Connected via QR scan ──────────────────────────────────────────
        if (status === "qrReadSuccess" || status === "isLogged") {
          lastConnectedAt.set(sessionId, Date.now());
          cancelReconnect(sessionId);        // cancel any pending reconnect!
          reconnectCount.delete(sessionId);  // reset backoff counter

          await db
            .update(whatsappSessionsTable)
            .set({ status: "connected" })
            .where(eq(whatsappSessionsTable.id, sessionId));
          qrCodes.delete(sessionId);
          emitToAll("status", { sessionId, status: "connected" });
          startKeepalive(sessionId);

          // NOTE: use fetchPhoneNumber(sessionId) — NOT (client, sessionId)
          // because `client` may not be in scope yet (temporal dead zone).
          // We always retrieve the client freshly inside fetchPhoneNumber.
          fetchPhoneNumber(sessionId).catch((e) =>
            logger.warn({ sessionId, err: e }, "fetchPhoneNumber error")
          );
        }

        // ── Browser fully closed ───────────────────────────────────────────
        else if (status === "browserClose" || status === "autocloseCalled") {
          stopKeepalive(sessionId);
          clients.delete(sessionId);
          launching.delete(sessionId);
          qrCodes.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "disconnected" })
            .where(eq(whatsappSessionsTable.id, sessionId));
          emitToAll("status", { sessionId, status: "disconnected" });
          scheduleReconnect(sessionId);
        }

        // ── QR waiting ─────────────────────────────────────────────────────
        else if (status === "notLogged") {
          await db
            .update(whatsappSessionsTable)
            .set({ status: "notLogged" })
            .where(eq(whatsappSessionsTable.id, sessionId));
          emitToAll("status", { sessionId, status: "notLogged" });
        }

        // ── Phone-side disconnect ──────────────────────────────────────────
        else if (
          status === "disconnectedMobile" ||
          status === "desconnectedMobile"
        ) {
          if (manuallyStopped.has(sessionId)) {
            logger.info({ sessionId }, "disconnectedMobile — manually stopped, ignoring");
            return;
          }

          // Ignore stale disconnect events fired within 30s of a fresh connect.
          // WPPConnect fires these during the syncing phase — they are not real.
          const connectedAt = lastConnectedAt.get(sessionId) ?? 0;
          if (Date.now() - connectedAt < 30_000) {
            logger.info({ sessionId }, "disconnectedMobile within 30s of connect — ignored (syncing artifact)");
            return;
          }

          logger.warn({ sessionId }, "Phone disconnected — reconnecting");
          stopKeepalive(sessionId);
          clients.delete(sessionId);
          launching.delete(sessionId);

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

    // Store client AFTER create() resolves
    clients.set(sessionId, client);
    launching.delete(sessionId);

    // ── Incoming message listener ─────────────────────────────────────────
    client.onMessage(async (message: any) => {
      try {
        if (message.fromMe) return;
        const from: string = message.from ?? "";
        if (from === "status@broadcast" || from.endsWith("@newsletter")) return;

        const session = await db.query.whatsappSessionsTable.findFirst({
          where: eq(whatsappSessionsTable.id, sessionId),
        });
        if (!session) return;

        const strip = (n: string) => n?.replace(/@(c\.us|lid|g\.us)$/, "") ?? "";
        await db.insert(messagesTable).values({
          sessionId,
          direction:   "inbound",
          fromNumber:  strip(message.from ?? ""),
          toNumber:    strip(message.to   ?? ""),
          messageType: message.type ?? "text",
          content:     message.body ?? null,
          mediaUrl:    null,
          caption:     message.caption ?? null,
          status:      "delivered",
          timestamp:   new Date(message.timestamp * 1000),
        });

        await db
          .update(whatsappSessionsTable)
          .set({ totalMessagesReceived: sql`${whatsappSessionsTable.totalMessagesReceived} + 1` })
          .where(eq(whatsappSessionsTable.id, sessionId));

        emitToAll("message", { sessionId, message });

        if (session.webhookUrl) {
          let events: string[] = [];
          try { events = session.webhookEvents ? JSON.parse(session.webhookEvents) : []; }
          catch { /* invalid JSON */ }

          if (events.includes("message.received") || events.length === 0) {
            const rawFrom     = message.from ?? "";
            const phoneNumber = rawFrom.includes("@") ? rawFrom.split("@")[0] : rawFrom;
            triggerWebhook(session.webhookUrl, {
              event: "message.received",
              sessionId,
              data: {
                type:        message.type      ?? "chat",
                from:        rawFrom,
                phoneNumber,
                to:          message.to        ?? "",
                body:        message.body      ?? "",
                timestamp:   message.timestamp ?? Math.floor(Date.now() / 1000),
                mediaUrl:    message.mediaUrl  ?? null,
                fileName:    message.fileName  ?? null,
                caption:     message.caption   ?? null,
                mimetype:    message.mimetype  ?? null,
              },
            });
          }
        }
      } catch (e) {
        logger.error({ sessionId, err: e }, "Error processing incoming message");
      }
    });
  } catch (e) {
    launching.delete(sessionId);
    logger.error({ sessionId, err: e }, "Failed to start WhatsApp session");
    await db
      .update(whatsappSessionsTable)
      .set({ status: "disconnected" })
      .where(eq(whatsappSessionsTable.id, sessionId));
    emitToAll("status", { sessionId, status: "disconnected" });
    throw e;
  }
}

// ── Stop session ──────────────────────────────────────────────────────────────
export async function stopSession(sessionId: string): Promise<void> {
  manuallyStopped.add(sessionId);
  stopping.add(sessionId);

  cancelReconnect(sessionId);
  reconnectCount.delete(sessionId);
  stopKeepalive(sessionId);
  launching.delete(sessionId);

  const client = clients.get(sessionId);
  clients.delete(sessionId);
  qrCodes.delete(sessionId);

  if (client) {
    // 1. Graceful WPPConnect close
    try { await client.close(); } catch { /* ignore */ }
    // 2. Kill underlying Puppeteer browser process
    try {
      const proc = client.browser?.process?.();
      if (proc) proc.kill("SIGKILL");
      await client.browser?.close().catch(() => {});
    } catch { /* ignore */ }
  }

  // 3. Force-kill any surviving Chrome processes for this session
  forceKillChrome(sessionId);
  await new Promise((r) => setTimeout(r, 500));
  cleanChromeLocks(sessionId);

  stopping.delete(sessionId);

  await db
    .update(whatsappSessionsTable)
    .set({ status: "disconnected" })
    .where(eq(whatsappSessionsTable.id, sessionId));
  emitToAll("status", { sessionId, status: "disconnected" });
}

// ── Public helpers ────────────────────────────────────────────────────────────
export function getClient(sessionId: string): any | null {
  return clients.get(sessionId) ?? null;
}

export function getQrCode(sessionId: string): string | null {
  return qrCodes.get(sessionId) ?? null;
}

export function isBrowserActive(sessionId: string): boolean {
  return clients.has(sessionId) || launching.has(sessionId);
}

// ── Webhook fire-and-forget ───────────────────────────────────────────────────
function triggerWebhook(url: string, payload: object): void {
  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  })
    .then((r) => {
      if (r.ok) logger.info({ url, status: r.status }, "Webhook delivered");
      else      logger.warn({ url, status: r.status }, "Webhook non-OK");
    })
    .catch((e) => logger.warn({ url, err: e }, "Webhook failed"));
}
