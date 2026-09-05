import { Router } from 'express';
import { EmailController } from '../controllers/EmailController';
import { validateBody } from '../middlewares/validateBody';
import { sendEmailRequestSchema } from '../dto/sendEmailSchema';

export function buildEmailRoutes(controller: EmailController): Router {
  const router = Router();

  router.post('/emails', validateBody(sendEmailRequestSchema), controller.sendEmail);
  router.get('/emails/:id', controller.getEmailStatus);

  return router;
}
