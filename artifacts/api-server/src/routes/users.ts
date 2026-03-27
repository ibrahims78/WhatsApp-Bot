import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword } from "../lib/auth";

const router: IRouter = Router();

function validatePasswordComplexity(password: string): string | null {
  if (password.length < 6) return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return "Password must contain at least one digit or special character";
  return null;
}

// GET /users
router.get("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safeUsers = users.map(({ passwordHash: _, ...u }) => u);
  res.json(safeUsers);
});

// POST /users
// Body: { username, email?, password, role, permissions?, maxSessions? }
router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, email, password, role, permissions, maxSessions } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ error: "Username, password, and role are required" });
    return;
  }

  const complexityError = validatePasswordComplexity(password);
  if (complexityError) {
    res.status(400).json({ error: complexityError });
    return;
  }

  // Serialize permissions
  let permissionsJson: string | null = null;
  if (permissions && typeof permissions === "object") {
    permissionsJson = JSON.stringify(permissions);
  } else if (typeof permissions === "string") {
    permissionsJson = permissions;
  }

  const maxSessionsVal = maxSessions !== undefined && maxSessions !== null && maxSessions !== ""
    ? parseInt(String(maxSessions), 10)
    : null;

  const passwordHash = hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      email: email || null,
      passwordHash,
      role,
      permissions: permissionsJson,
      maxSessions: isNaN(maxSessionsVal as any) ? null : maxSessionsVal,
    })
    .returning();

  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

// GET /users/:id
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const currentUser = (req as any).user;
  if (currentUser.role !== "admin" && currentUser.id !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// PATCH /users/:id
// Supports: username, email, password, role, permissions, maxSessions, isActive
router.patch("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const { username, email, password, role, permissions, maxSessions, isActive } = req.body;
  const updates: any = {};

  if (username !== undefined) updates.username = username;
  if (email !== undefined) updates.email = email;
  if (password) {
    const complexityError = validatePasswordComplexity(password);
    if (complexityError) {
      res.status(400).json({ error: complexityError });
      return;
    }
    updates.passwordHash = hashPassword(password);
    updates.mustChangePassword = false;
  }
  if (role !== undefined) updates.role = role;
  if (permissions !== undefined) {
    if (permissions === null) {
      updates.permissions = null;
    } else if (typeof permissions === "object") {
      updates.permissions = JSON.stringify(permissions);
    } else {
      updates.permissions = permissions;
    }
  }
  if (maxSessions !== undefined) {
    if (maxSessions === null || maxSessions === "" || maxSessions === 0) {
      updates.maxSessions = null;
    } else {
      const val = parseInt(String(maxSessions), 10);
      updates.maxSessions = isNaN(val) ? null : val;
    }
  }
  if (isActive !== undefined) updates.isActive = isActive;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// DELETE /users/:id
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const currentUser = (req as any).user;
  if (currentUser.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
