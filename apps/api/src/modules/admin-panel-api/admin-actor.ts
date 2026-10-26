import { type Actor } from '../../common/audit.service.js';
import { type AuthedAdmin } from '../../common/auth/guards.js';
import { type RequestMeta } from '../../common/request-meta.js';

/** Audit actor for an admin request (who + from where). */
export const actorOf = (a: AuthedAdmin, meta: RequestMeta): Actor => ({ type: 'ADMIN', id: a.id, label: a.email, ...meta });
