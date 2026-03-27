import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
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

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.includes(".replit.dev") || origin.endsWith(".repl.co") || origin.endsWith(".replit.app")) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Fallback: allow. Tighten via ALLOWED_ORIGINS in production.
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
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

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

// Static files served BEFORE the API router
app.use("/api/files", express.static(path.join(process.cwd(), "public")));

app.use("/api", router);

export default app;
