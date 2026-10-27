import { Router, type IRouter } from "express";
import healthRouter from "./health";
import classroomRouter from "./classroom";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classroomRouter);

export default router;
