import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/n8n-workflow/download", requireAuth, (req, res): void => {
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

  const injected = raw.replaceAll("https://YOUR-APP-DOMAIN", domain);

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
