'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from './auth-store';

/** Sends guests to the login page (and back here afterwards). */
export function useRequireAuth() {
  const status = useAuth((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'guest') router.replace({ pathname: '/login', query: { next: pathname } });
  }, [status, router, pathname]);
  return status === 'authed';
}
