import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "./lib/auth";
import { apiRateLimiter } from "./lib/rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Trust proxy — required for correct req.ip behind Replit's mTLS proxy ─────
// Without this, req.ip returns the internal proxy address instead of the
// real client IP, which breaks rate limiting and audit log accuracy.
app.set("trust proxy", 1);

// ── HTTP Security Headers (Helmet) ───────────────────────────────────────────
// This is a JSON API — disable CSP and document-oriented headers that are
// irrelevant for API responses, and keep headers that protect all HTTP traffic.
app.use(
  helmet({
    contentSecurityPolicy: false,      // API — no HTML pages served here
    crossOriginEmbedderPolicy: false,  // Not needed for API responses
    crossOriginOpenerPolicy: false,    // Not needed for API responses
    crossOriginResourcePolicy: false,  // Static files via /api/files need cross-origin access
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin requests (server-to-server, curl, etc.) have no Origin header
      if (!origin) return callback(null, true);
      // Always allow Replit preview and production domains
      if (
        origin.includes(".replit.dev") ||
        origin.endsWith(".repl.co") ||
        origin.endsWith(".replit.app")
      ) {
        return callback(null, true);
      }
      // Allow any additional origins configured via environment variable
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Block all other origins in production
      logger.warn({ origin }, "CORS: request blocked from unlisted origin");
      return callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cookieParser());
// 50MB limit: enough for base64-encoded media (video/audio/image).
// Base64 adds ~33% overhead, so 50MB covers ~37MB of raw binary.
// Keeping it well below 100MB reduces DoS attack surface.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Apply general rate limiting to all requests
app.use(apiRateLimiter);

// ── mustChangePassword enforcement ───────────────────────────────────────────
// Block all API calls (except auth & own-user-update) when mustChangePassword=true.
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const allowedPaths = ["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/healthz"];
  const isUserPatch = req.method === "PATCH" && /^\/api\/users\/\d+$/.test(req.path);
  if (allowedPaths.some((p) => req.path.startsWith(p)) || isUserPatch) return next();

  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if ((req as any).cookies?.session_token) {
    token = (req as any).cookies.session_token;
  }

  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload) return next();

  try {
    const [user] = await db
      .select({ mustChangePassword: usersTable.mustChangePassword })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (user?.mustChangePassword) {
      res.status(403).json({
        error: "must_change_password",
        message: "You must change your password before continuing.",
      });
      return;
    }
  } catch { /* DB error — let the route handle auth */ }

  next();
});

// ── Health check ─────────────────────────────────────────────────────────────
// Replit (and load balancers) ping GET / every ~30s. Without this handler,
// the request falls through to 404 and creates noisy log entries.
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "whatsapp-api" });
});

// Static files served BEFORE the API router
app.use("/api/files", express.static(path.join(process.cwd(), "public")));

app.use("/api", router);

export default app;
