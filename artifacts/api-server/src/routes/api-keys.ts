import { Router, type IRouter } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

// GET /api-keys
router.get("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, user.id));
  const safeKeys = keys.map(({ keyHash: _, ...k }) => k);
  res.json(safeKeys);
});

// POST /api-keys
router.post("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const user = (req as any).user;
  const secret = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
  const keyHash = bcrypt.hashSync(secret, 10);
  const keyPrefix = secret.substring(0, 8);

  const [key] = await db
    .insert(apiKeysTable)
    .values({ userId: user.id, name, keyHash, keyPrefix })
    .returning();

  const { keyHash: _, ...safeKey } = key;
  res.status(201).json({ ...safeKey, secret });
});

// DELETE /api-keys/:id
router.delete("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const user = (req as any).user;

  const [key] = await db
    .delete(apiKeysTable)
    .where(eq(apiKeysTable.id, id))
    .returning();

  if (!key || (key.userId !== user.id && user.role !== "admin")) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
