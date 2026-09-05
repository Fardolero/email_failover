import { Router } from 'express';

export function buildHealthRoutes(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
  });

  return router;
}
