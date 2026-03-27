import { create } from "@wppconnect-team/wppconnect";
import { db, whatsappSessionsTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { execSync, spawnSync } from "child_process";
import { existsSync, rmSync, readdirSync } from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Chrome path — the binary downloaded by Puppeteer
// ─────────────────────────────────────────────────────────────────────────────
const CHROME_PATH =
  "/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome";

const TOKENS_DIR = path.join(process.cwd(), "tokens");

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

/** Remove every Chrome lock file that can block a fresh browser launch */
function cleanChromeLocks(sessionId: string): void {
  const dir = path.join(TOKENS_DIR, sessionId);
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const f = path.join(dir, name);
    if (existsSync(f)) {
      try { rmSync(f, { force: true }); }
      catch { /* ignore */ }
    }
  }
}

/** Delete the Chrome user-data "Default" sub-directory inside the token folder.
 *  This forces a completely clean browser profile on the next launch, which
 *  avoids "Session Unpaired" → loop problems caused by stale cached credentials. */
function deleteStaleTokenProfile(sessionId: string): void {
  const defaultDir = path.join(TOKENS_DIR, sessionId, "Default");
  if (existsSync(defaultDir)) {
    try {
      rmSync(defaultDir, { recursive: true, force: true });
      logger.info({ sessionId }, "Deleted stale Chrome Default profile (will force fresh login)");
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Could not delete stale Default profile");
    }
  }
}

/** Kill every Chrome process that is using this session's profile directory */
function forceKillChrome(sessionId: string): void {
  try {
    spawnSync("pkill", ["-9", "-f", `tokens/${sessionId}`], { timeout: 3_000 });
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────────────────────────────
const clients        = new Map<string, any>();     // sessionId → WPPConnect client
const launching      = new Set<string>();          // sessions currently starting up
const stopping       = new Set<string>();          // sessions being torn down
const manuallyStopped = new Set<string>();         // sessions stopped on purpose (no auto-reconnect)
const waitingForQR   = new Set<string>();          // sessions where QR is on screen
const qrCodes        = new Map<string, string>();
const keepaliveTimers  = new Map<string, ReturnType<typeof setInterval>>();
const reconnectTimers  = new Map<string, ReturnType<typeof setTimeout>>();
const reconnectCount   = new Map<string, number>();
const lastConnectedAt  = new Map<string, number>();

let io: SocketServer;

// ─────────────────────────────────────────────────────────────────────────────
// Socket server
// ─────────────────────────────────────────────────────────────────────────────
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

/** Ping self every 30 s so Replit never idles the container */
function startSelfPing(): void {
  const PORT = process.env.PORT || 8080;
  setInterval(async () => {
    try { await fetch(`http://localhost:${PORT}/`); } catch { /* ok */ }
  }, 30_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Keepalive
// ─────────────────────────────────────────────────────────────────────────────
function startKeepalive(sessionId: string): void {
  stopKeepalive(sessionId);
  const t = setInterval(async () => {
    const client = clients.get(sessionId);
    if (!client) { stopKeepalive(sessionId); return; }
    try {
      // Use getConnectionState for a more reliable check than isConnected()
      const state = await client.getConnectionState().catch(() => null);
      const connected = state === "CONNECTED" || (await client.isConnected().catch(() => false));
      if (!connected) {
        logger.warn({ sessionId, state }, "Keepalive: not connected — scheduling reconnect");
        stopKeepalive(sessionId);
        clients.delete(sessionId);
        scheduleReconnect(sessionId);
      } else {
        logger.debug({ sessionId }, "Keepalive: OK");
      }
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Keepalive error — scheduling reconnect");
      stopKeepalive(sessionId);
      clients.delete(sessionId);
      scheduleReconnect(sessionId);
    }
  }, 30_000); // every 30s (was 45s)
  keepaliveTimers.set(sessionId, t);
}

function stopKeepalive(sessionId: string): void {
  const t = keepaliveTimers.get(sessionId);
  if (t) { clearInterval(t); keepaliveTimers.delete(sessionId); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-reconnect with exponential backoff
// ─────────────────────────────────────────────────────────────────────────────
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
    if (clients.has(sessionId) || launching.has(sessionId)) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Phone-number fetch — waits for create() to resolve, then tries multiple
// WPPConnect methods with full response logging so we can debug failures.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPhoneNumber(sessionId: string): Promise<void> {
  // Wait for create() to resolve and store the client in the map.
  // MAIN NORMAL state is reached ~8s after qrReadSuccess — give it 12s.
  await new Promise((r) => setTimeout(r, 12_000));

  for (let i = 0; i < 20; i++) {
    const client = clients.get(sessionId);
    if (!client) {
      logger.warn({ sessionId }, "fetchPhoneNumber: client gone — aborting");
      return;
    }

    // ── Method 1: getWid() — returns "966501234567@c.us" directly ──────────
    try {
      const wid: string | null = await client.getWid();
      logger.debug({ sessionId, attempt: i + 1, wid }, "getWid response");
      if (wid && typeof wid === "string" && wid.includes("@")) {
        const phone = wid.split("@")[0];
        if (phone && /^\d{5,15}$/.test(phone)) {
          await savePhoneNumber(sessionId, phone, "getWid");
          return;
        }
      }
    } catch (e: any) {
      logger.debug({ sessionId, attempt: i + 1, err: e?.message }, "getWid threw");
    }

    // ── Method 2: getHostDevice() — returns { id: { user, server, ... } } ──
    try {
      const host = await client.getHostDevice();
      logger.debug({ sessionId, attempt: i + 1, host: JSON.stringify(host) }, "getHostDevice response");
      const phone: string | null =
        host?.id?.user    ??
        host?.wid?.user   ??
        host?.me?.user    ??
        null;
      if (phone && /^\d{5,15}$/.test(phone)) {
        await savePhoneNumber(sessionId, phone, "getHostDevice");
        return;
      }
    } catch (e: any) {
      logger.debug({ sessionId, attempt: i + 1, err: e?.message }, "getHostDevice threw");
    }

    // ── Method 3: getMe() — returns { id: { user, server } } ───────────────
    try {
      const me = await client.getMe();
      logger.debug({ sessionId, attempt: i + 1, me: JSON.stringify(me) }, "getMe response");
      const phone: string | null =
        me?.id?.user  ??
        me?.wid?.user ??
        null;
      if (phone && /^\d{5,15}$/.test(phone)) {
        await savePhoneNumber(sessionId, phone, "getMe");
        return;
      }
    } catch (e: any) {
      logger.debug({ sessionId, attempt: i + 1, err: e?.message }, "getMe threw");
    }

    await new Promise((r) => setTimeout(r, 5_000));
  }

  logger.warn({ sessionId }, "Could not retrieve phone number after all retries");
}

async function savePhoneNumber(sessionId: string, phone: string, via: string): Promise<void> {
  await db
    .update(whatsappSessionsTable)
    .set({ phoneNumber: phone })
    .where(eq(whatsappSessionsTable.id, sessionId));
  emitToAll("phoneNumber", { sessionId, phoneNumber: phone });
  logger.info({ sessionId, phone, via }, "Phone number saved");
}

// ─────────────────────────────────────────────────────────────────────────────
// Start session
// ─────────────────────────────────────────────────────────────────────────────
export async function startSession(sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info({ sessionId }, "Session already connected");
    return;
  }
  if (launching.has(sessionId)) {
    logger.info({ sessionId }, "Session already launching");
    return;
  }
  if (stopping.has(sessionId)) {
    logger.warn({ sessionId }, "Session still stopping — waiting");
    await new Promise((r) => setTimeout(r, 3_000));
    if (stopping.has(sessionId)) {
      logger.error({ sessionId }, "Still stopping — abort launch");
      return;
    }
  }

  manuallyStopped.delete(sessionId);
  launching.add(sessionId);
  waitingForQR.delete(sessionId);

  // Kill any leftover Chrome, then clean locks
  forceKillChrome(sessionId);
  await new Promise((r) => setTimeout(r, 800));
  cleanChromeLocks(sessionId);
  ensureChrome();

  // Mark autoReconnect=true so server restarts will reconnect this session
  await db
    .update(whatsappSessionsTable)
    .set({ status: "connecting", autoReconnect: true })
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

      // ── puppeteerOptions — executablePath MUST be here, not at top level ──
      puppeteerOptions: {
        executablePath: CHROME_PATH,   // ← CRITICAL FIX: was wrongly at top level
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-extensions",
          "--disable-default-apps",
          "--no-default-browser-check",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
          "--disable-popup-blocking",
          "--disable-background-networking",
          "--disable-sync",
          "--metrics-recording-only",
          "--mute-audio",
          "--password-store=basic",
          "--use-mock-keychain",
          "--force-color-profile=srgb",
          "--js-flags=--max-old-space-size=512",
        ],
      },

      catchQR: async (base64QR: string, _ascii: string, attempts: number) => {
        logger.info({ sessionId, attempts }, "QR code ready");
        waitingForQR.add(sessionId);
        qrCodes.set(sessionId, base64QR);
        emitToAll("qr", { sessionId, qr: base64QR });
      },

      statusFind: async (status: string) => {
        logger.info({ sessionId, status }, "WPPConnect status");

        // ── Successfully connected ─────────────────────────────────────────
        if (status === "qrReadSuccess" || status === "isLogged") {
          waitingForQR.delete(sessionId);
          lastConnectedAt.set(sessionId, Date.now());
          cancelReconnect(sessionId);
          reconnectCount.delete(sessionId);

          await db
            .update(whatsappSessionsTable)
            .set({ status: "connected" })
            .where(eq(whatsappSessionsTable.id, sessionId));

          qrCodes.delete(sessionId);
          emitToAll("status", { sessionId, status: "connected" });
          startKeepalive(sessionId);

          // Fetch phone number in background — client stored after create() resolves
          fetchPhoneNumber(sessionId).catch((e) =>
            logger.warn({ sessionId, err: e }, "fetchPhoneNumber error")
          );
        }

        // ── Browser fully closed ───────────────────────────────────────────
        else if (status === "browserClose" || status === "autocloseCalled") {
          waitingForQR.delete(sessionId);
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
          waitingForQR.add(sessionId);
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
          // IGNORE if manually stopped
          if (manuallyStopped.has(sessionId)) return;

          // IGNORE if this session has NEVER successfully connected.
          // WPPConnect fires disconnectedMobile when it tries an old (invalid)
          // saved token and WhatsApp rejects it ("Session Unpaired"). This is
          // not a real phone disconnect — it just means we need to scan QR.
          if (!lastConnectedAt.has(sessionId)) {
            logger.info({ sessionId }, "disconnectedMobile before first connect — ignored (startup token rejection)");
            return;
          }

          // IGNORE if QR is currently visible — still a startup artifact
          if (waitingForQR.has(sessionId)) {
            logger.info({ sessionId }, "disconnectedMobile while QR visible — ignored");
            return;
          }

          // IGNORE if we just connected in the last 60 s — syncing artifact
          const elapsed = Date.now() - (lastConnectedAt.get(sessionId) ?? 0);
          if (elapsed < 60_000) {
            logger.info({ sessionId, elapsedMs: elapsed }, "disconnectedMobile within 60s of connect — ignored");
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
        // inChat, isLogin, chatsAvailable, SYNCING — intermediate, ignore
      },
    });

    // create() has resolved → store the client reference
    clients.set(sessionId, client);
    launching.delete(sessionId);

    // ── Incoming message listener ──────────────────────────────────────────
    client.onMessage(async (message: any) => {
      try {
        if (message.fromMe) return;
        const from: string = message.from ?? "";
        if (from === "status@broadcast" || from.endsWith("@newsletter")) return;

        const session = await db.query.whatsappSessionsTable.findFirst({
          where: eq(whatsappSessionsTable.id, sessionId),
        });
        if (!session) return;

        // ── Receive feature-flag enforcement ─────────────────────────────────
        const msgType = (message.type ?? "chat").toLowerCase();
        const receiveFeatureMap: Record<string, string> = {
          chat:     "receiveText",
          text:     "receiveText",
          image:    "receiveImage",
          video:    "receiveVideo",
          audio:    "receiveAudio",
          ptt:      "receiveAudio",
          document: "receiveFile",
        };
        const receiveFeature = receiveFeatureMap[msgType];
        if (receiveFeature && session.features) {
          try {
            const feats: Record<string, boolean> = JSON.parse(session.features);
            if (Object.keys(feats).length > 0 && feats[receiveFeature] === false) {
              logger.info({ sessionId, msgType, receiveFeature }, "Message blocked by feature flag");
              return;
            }
          } catch { /* bad JSON — allow */ }
        }

        const strip = (n: string) => n?.replace(/@(c\.us|lid|g\.us)$/, "") ?? "";
        await db.insert(messagesTable).values({
          sessionId,
          direction:   "inbound",
          fromNumber:  strip(message.from ?? ""),
          toNumber:    strip(message.to   ?? ""),
          messageType: message.type   ?? "text",
          content:     message.body   ?? null,
          mediaUrl:    null,
          caption:     message.caption ?? null,
          status:      "delivered",
          timestamp:   new Date(message.timestamp * 1000),
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
          try { events = session.webhookEvents ? JSON.parse(session.webhookEvents) : []; }
          catch { /* bad JSON */ }
          if (events.includes("message.received") || events.length === 0) {
            const rawFrom     = message.from ?? "";
            const phoneNumber = rawFrom.includes("@") ? rawFrom.split("@")[0] : rawFrom;
            triggerWebhook(session.webhookUrl, {
              event: "message.received",
              sessionId,
              data: {
                type:      message.type      ?? "chat",
                from:      rawFrom,
                phoneNumber,
                to:        message.to        ?? "",
                body:      message.body      ?? "",
                timestamp: message.timestamp ?? Math.floor(Date.now() / 1000),
                mediaUrl:  message.mediaUrl  ?? null,
                fileName:  message.fileName  ?? null,
                caption:   message.caption   ?? null,
                mimetype:  message.mimetype  ?? null,
              },
            });
          }
        }
      } catch (e) {
        logger.error({ sessionId, err: e }, "Error processing message");
      }
    });
  } catch (e: any) {
    launching.delete(sessionId);
    waitingForQR.delete(sessionId);

    logger.error({ sessionId, err: e }, "Failed to start session");

    // If the error is a detached-frame / authentication error, delete the
    // stale Chrome profile so the next attempt starts completely clean.
    if (
      e?.message?.includes("detached Frame") ||
      e?.message?.includes("Unknow error") ||
      e?.message?.includes("Failed to authenticate")
    ) {
      logger.warn({ sessionId }, "Deleting stale token profile to force clean login");
      deleteStaleTokenProfile(sessionId);
    }

    await db
      .update(whatsappSessionsTable)
      .set({ status: "disconnected" })
      .where(eq(whatsappSessionsTable.id, sessionId));
    emitToAll("status", { sessionId, status: "disconnected" });
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop session  (manual disconnect — marks autoReconnect=false in DB)
// ─────────────────────────────────────────────────────────────────────────────
export async function stopSession(sessionId: string): Promise<void> {
  manuallyStopped.add(sessionId);
  stopping.add(sessionId);

  cancelReconnect(sessionId);
  reconnectCount.delete(sessionId);
  stopKeepalive(sessionId);
  launching.delete(sessionId);
  waitingForQR.delete(sessionId);

  const client = clients.get(sessionId);
  clients.delete(sessionId);
  qrCodes.delete(sessionId);

  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    try {
      const proc = client.browser?.process?.();
      if (proc) proc.kill("SIGKILL");
      await client.browser?.close().catch(() => {});
    } catch { /* ignore */ }
  }

  forceKillChrome(sessionId);
  await new Promise((r) => setTimeout(r, 600));
  cleanChromeLocks(sessionId);

  stopping.delete(sessionId);

  // Mark autoReconnect=false so the session is NOT restarted on server reboot
  await db
    .update(whatsappSessionsTable)
    .set({ status: "disconnected", autoReconnect: false })
    .where(eq(whatsappSessionsTable.id, sessionId));
  emitToAll("status", { sessionId, status: "disconnected" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete session — full cleanup: stop browser + remove token files from disk
// Called before deleting the DB record so the session never auto-starts again.
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteSessionFiles(sessionId: string): Promise<void> {
  // First stop the browser (also marks manuallyStopped so no reconnect fires)
  await stopSession(sessionId);

  // Remove the token folder from disk so wppconnect can't reuse old credentials
  const tokenDir = path.join(TOKENS_DIR, sessionId);
  if (existsSync(tokenDir)) {
    try {
      rmSync(tokenDir, { recursive: true, force: true });
      logger.info({ sessionId }, "Token folder deleted");
    } catch (e) {
      logger.warn({ sessionId, err: e }, "Could not delete token folder");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────
export function getClient(sessionId: string): any | null {
  return clients.get(sessionId) ?? null;
}

export function getQrCode(sessionId: string): string | null {
  return qrCodes.get(sessionId) ?? null;
}

export function isBrowserActive(sessionId: string): boolean {
  return clients.has(sessionId) || launching.has(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-start sessions on server boot
// Reads all non-banned sessions from DB and starts them so they reconnect
// automatically after a server restart — no manual intervention needed.
// ─────────────────────────────────────────────────────────────────────────────
export async function initializeSessions(): Promise<void> {
  try {
    const allSessions = await db
      .select({ id: whatsappSessionsTable.id, status: whatsappSessionsTable.status, autoReconnect: whatsappSessionsTable.autoReconnect })
      .from(whatsappSessionsTable);

    // Only start sessions that have autoReconnect=true (i.e. NOT manually stopped by user).
    // Banned sessions are also excluded.
    // wppconnect uses saved tokens to reconnect silently without showing QR.
    const toStart = allSessions.filter((s) => s.autoReconnect && s.status !== "banned");

    if (toStart.length === 0) {
      logger.info("No sessions found in DB — skipping auto-start");
      return;
    }

    logger.info({ count: toStart.length }, "Auto-starting sessions on boot");

    // Stagger starts by 4 seconds each to avoid Chrome resource contention
    for (let i = 0; i < toStart.length; i++) {
      const { id } = toStart[i];
      setTimeout(async () => {
        try {
          logger.info({ sessionId: id, index: i }, "Auto-starting session");
          await startSession(id);
        } catch (e) {
          logger.warn({ sessionId: id, err: e }, "Auto-start failed for session");
        }
      }, i * 4_000);
    }
  } catch (e) {
    logger.error({ err: e }, "Failed to auto-start sessions on boot");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────
function triggerWebhook(url: string, payload: object): void {
  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  })
    .then((r) =>
      r.ok
        ? logger.info({ url, status: r.status }, "Webhook delivered")
        : logger.warn({ url, status: r.status }, "Webhook non-OK")
    )
    .catch((e) => logger.warn({ url, err: e }, "Webhook failed"));
}
