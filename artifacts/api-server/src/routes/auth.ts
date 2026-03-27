import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
} from "../lib/auth";
import { loginRateLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

// POST /auth/login — rate limited (brute-force protection)
router.post("/auth/login", loginRateLimiter, async (req, res): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user.id, user.role);

  // Mark secure whenever running on Replit (both dev and production)
  // or in any production deployment. Replit always serves over HTTPS,
  // so the cookie must be flagged secure to prevent downgrade attacks.
  const isSecureContext =
    process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEV_DOMAIN;
  res.cookie("session_token", token, {
    httpOnly: true,
    secure: isSecureContext,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  const { passwordHash: _, ...safeUser } = user;
  res.json({
    token,
    user: { ...safeUser, mustChangePassword: user.mustChangePassword },
  });
});

// POST /auth/logout
router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  res.clearCookie("session_token");
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { passwordHash: _, ...safeUser } = user;
  res.json({ ...safeUser, mustChangePassword: user.mustChangePassword });
});

export default router;
