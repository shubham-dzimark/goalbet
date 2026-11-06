'use client';

import { useRouter } from '@/i18n/navigation';
import { api } from './api';
import { useAuth } from './auth-store';

/** Ends the session on the server, clears it here and goes home. */
export function useLogout() {
  const router = useRouter();
  return async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    useAuth.getState().clear();
    router.push('/');
  };
}
