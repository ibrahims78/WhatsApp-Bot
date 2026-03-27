import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const JWT_SECRET = process.env.JWT_SECRET || "whatsapp_dashboard_secret_key_change_in_prod";
const TOKEN_EXPIRY = "7d";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
  } catch {
    return null;
  }
}

/**
 * Parse the user's granular permissions JSON.
 * Returns null if no permissions set (means all allowed).
 */
export function parsePermissions(permissionsJson: string | null | undefined): Record<string, boolean> | null {
  if (!permissionsJson) return null;
  try {
    const parsed = JSON.parse(permissionsJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a user has permission for a specific action.
 * Admins always have full access.
 * If no permissions set for the user, all actions are allowed.
 * If permissions set, the action must be explicitly true (or not present = allowed).
 */
export function hasPermission(user: any, action: string): boolean {
  if (user.role === "admin") return true;
  const perms = parsePermissions(user.permissions);
  if (!perms || Object.keys(perms).length === 0) return true;
  // If the key is missing → default allow; blocked only when explicitly false
  return perms[action] !== false;
}

/**
 * Parse allowed session IDs from API key record.
 * Returns null if no restriction (all sessions allowed).
 */
export function parseAllowedSessionIds(json: string | null | undefined): string[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if an API key allows access to a specific session.
 * If no restriction set on the key → all sessions allowed.
 */
export function apiKeyAllowsSession(apiKeyRecord: any, sessionId: string): boolean {
  if (!apiKeyRecord) return true;
  const allowed = parseAllowedSessionIds(apiKeyRecord.allowedSessionIds);
  if (!allowed) return true;
  return allowed.includes(sessionId);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.session_token) {
    token = req.cookies.session_token;
  }

  // Check X-API-Key header
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey && !token) {
    try {
      const allKeys = await db.select().from(apiKeysTable);
      for (const keyRecord of allKeys) {
        if (bcrypt.compareSync(apiKey, keyRecord.keyHash)) {
          // Update last used
          await db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, keyRecord.id));
          // Load user
          const [user] = await db.select().from(usersTable).where(eq(usersTable.id, keyRecord.userId));
          if (user && user.isActive) {
            (req as any).user = user;
            // Attach the API key record so routes can check session restrictions
            (req as any).apiKeyRecord = keyRecord;
            next();
            return;
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "Error validating API key");
    }
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  (req as any).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
