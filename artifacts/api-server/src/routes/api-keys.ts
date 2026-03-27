import { Router, type IRouter } from "express";
import { db, apiKeysTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

// GET /api-keys
// Admin: returns ALL keys for all users (with username included)
// Employee: returns only their own keys
router.get("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;

  if (user.role === "admin") {
    // Admin sees all keys with owner username
    const keys = await db.select().from(apiKeysTable).orderBy(apiKeysTable.createdAt);
    const users = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    const safeKeys = keys.map(({ keyHash: _, ...k }) => ({
      ...k,
      ownerUsername: userMap[k.userId] ?? "unknown",
    }));
    res.json(safeKeys);
  } else {
    const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, user.id));
    const safeKeys = keys.map(({ keyHash: _, ...k }) => ({
      ...k,
      ownerUsername: user.username,
    }));
    res.json(safeKeys);
  }
});

// POST /api-keys
// Admin can create a key for any user (pass userId in body)
// Employee creates only for themselves
// Body: { name, allowedSessionIds?: string[] }
router.post("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const currentUser = (req as any).user;
  const { name, allowedSessionIds } = req.body;

  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  // Determine target user
  let targetUserId: number = currentUser.id;
  if (currentUser.role === "admin" && req.body.userId && req.body.userId !== currentUser.id) {
    // Admin creating key for another user
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.body.userId));
    if (!targetUser) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }
    targetUserId = targetUser.id;
  }

  const secret = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
  const keyHash = bcrypt.hashSync(secret, 10);
  const keyPrefix = secret.substring(0, 8);

  // Serialize allowed session IDs
  let allowedSessionIdsJson: string | null = null;
  if (Array.isArray(allowedSessionIds) && allowedSessionIds.length > 0) {
    allowedSessionIdsJson = JSON.stringify(allowedSessionIds);
  }

  const [key] = await db
    .insert(apiKeysTable)
    .values({ userId: targetUserId, name, keyHash, keyPrefix, allowedSessionIds: allowedSessionIdsJson })
    .returning();

  const { keyHash: _, ...safeKey } = key;
  res.status(201).json({ ...safeKey, secret });
});

// PATCH /api-keys/:id
// Admin only: update allowedSessionIds for any key
router.patch("/api-keys/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const { allowedSessionIds } = req.body;

  let allowedSessionIdsJson: string | null = null;
  if (Array.isArray(allowedSessionIds)) {
    allowedSessionIdsJson = allowedSessionIds.length > 0 ? JSON.stringify(allowedSessionIds) : null;
  }

  const [key] = await db
    .update(apiKeysTable)
    .set({ allowedSessionIds: allowedSessionIdsJson })
    .where(eq(apiKeysTable.id, id))
    .returning();

  if (!key) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  const { keyHash: _, ...safeKey } = key;
  res.json(safeKey);
});

// DELETE /api-keys/:id
// Admin can delete any key; employee can only delete their own
router.delete("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const user = (req as any).user;

  const [existing] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  if (user.role !== "admin" && existing.userId !== user.id) {
    res.status(403).json({ error: "You can only delete your own API keys" });
    return;
  }

  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  res.sendStatus(204);
});

export default router;
