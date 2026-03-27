import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import apiKeysRouter from "./api-keys";
import sessionsRouter from "./sessions";
import sendRouter from "./send";
import n8nWorkflowRouter from "./n8n-workflow";
import dashboardRouter from "./dashboard";
import auditLogsRouter from "./audit-logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(apiKeysRouter);
router.use(sessionsRouter);
router.use(sendRouter);
router.use(n8nWorkflowRouter);
router.use(dashboardRouter);
router.use(auditLogsRouter);

export default router;
