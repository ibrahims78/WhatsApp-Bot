import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { requireAuth } from "../lib/auth";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

const N8N_KEY_NAME = "n8n Workflow";

router.get("/n8n-workflow/download", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;

  // ── 1. Check if the user has any API keys ──────────────────────────────────
  const existingKeys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, user.id));

  if (existingKeys.length === 0) {
    res.status(403).json({
      error: "no_api_key",
      message: "You must create at least one API key before downloading the workflow. Go to the API Keys page to create one.",
    });
    return;
  }

  // ── 2. Delete any previously auto-generated n8n key then create a fresh one ─
  const oldN8nKey = existingKeys.find(k => k.name === N8N_KEY_NAME);
  if (oldN8nKey) {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.id, oldN8nKey.id));
  }

  const secret = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
  const keyHash = bcrypt.hashSync(secret, 10);
  const keyPrefix = secret.substring(0, 8);

  await db.insert(apiKeysTable).values({
    userId: user.id,
    name: N8N_KEY_NAME,
    keyHash,
    keyPrefix,
  });

  // ── 3. Read and transform the workflow template ────────────────────────────
  const filePath = resolve(process.cwd(), "../../doc/n8n-workflow-whatsapp.json");

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    res.status(500).json({ error: "Workflow template file not found" });
    return;
  }

  const host =
    req.headers["x-forwarded-host"] ||
    req.headers["host"] ||
    "YOUR-APP-DOMAIN";

  const proto =
    req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");

  const domain = `${proto}://${host}`;

  const injected = raw
    .replaceAll("https://YOUR-APP-DOMAIN", domain)
    .replaceAll("WHATSAPP_MANAGER_API_KEY_PLACEHOLDER", secret);

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="n8n-workflow-whatsapp.json"',
  );
  res.send(injected);
});

router.get("/doc/n8n-workflow-guide", requireAuth, (_req, res): void => {
  const filePath = resolve(process.cwd(), "../../doc/n8n-workflow-guide.md");

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    res.status(500).json({ error: "Guide file not found" });
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(content);
});

export default router;
