import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import apiKeysRouter from "./api-keys";
import sessionsRouter from "./sessions";
import sendRouter from "./send";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(apiKeysRouter);
router.use(sessionsRouter);
router.use(sendRouter);

export default router;
