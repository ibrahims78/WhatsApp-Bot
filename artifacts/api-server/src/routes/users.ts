import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword } from "../lib/auth";

const router: IRouter = Router();

// GET /users
router.get("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safeUsers = users.map(({ passwordHash: _, ...u }) => u);
  res.json(safeUsers);
});

// POST /users
router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, email, password, role, permissions } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ error: "Username, password, and role are required" });
    return;
  }

  const passwordHash = hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ username, email: email || null, passwordHash, role, permissions: permissions || null })
    .returning();

  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

// GET /users/:id
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const currentUser = (req as any).user;
  // Employees can only see their own profile
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
router.patch("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const { username, email, password, role, permissions, isActive } = req.body;
  const updates: any = {};

  if (username !== undefined) updates.username = username;
  if (email !== undefined) updates.email = email;
  if (password) updates.passwordHash = hashPassword(password);
  if (role !== undefined) updates.role = role;
  if (permissions !== undefined) updates.permissions = permissions;
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
