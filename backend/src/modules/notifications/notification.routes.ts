import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notification.schema';
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from './notification.controller';

const router = Router();

// No extra requirePermission here, on purpose — same precedent as
// /push-subscriptions ("any admin can register their own device — no extra
// permission"). Every admin/staff should see the bell; row-level filtering
// by `requiredPermission` inside listNotificationsForUser already scopes
// *what* they see to what they're actually allowed to.
router.get('/', validate({ query: listNotificationsQuerySchema }), asyncHandler(listNotificationsHandler));
router.post('/:id/read', validate({ params: notificationIdParamSchema }), asyncHandler(markNotificationReadHandler));
router.post('/read-all', asyncHandler(markAllNotificationsReadHandler));

export default router;
