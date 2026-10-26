'use client';

import { type QueryKey, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type Page } from '@goalbet/shared';
import { ApiError, adminApi, useSession } from './session';

type Params = Record<string, string | number | boolean | undefined | null>;

/** Query string without empty values. */
export function qs(params: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Cursor-paged admin list ("Load more"). */
export function usePaged<T>(key: QueryKey, path: string, params: Params = {}, opts: { refetchInterval?: number } = {}) {
  const query = useInfiniteQuery({
    queryKey: [...key, params],
    queryFn: ({ pageParam }) => adminApi<Page<T>>(`${path}${qs({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...(opts.refetchInterval ? { refetchInterval: opts.refetchInterval } : {}),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...query, items };
}

/** Mutation that refreshes the listed queries afterwards. */
export function useAdminMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
    },
  });
}

/** Typed error code → readable message (shared `errors.*`, with a generic fallback). */
export function useErrorText() {
  const t = useTranslations();
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    const key = `errors.${code}`;
    return t.has(key) ? t(key) : t('errors.INTERNAL');
  };
}

export type Role = 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE';

/** Role check mirroring the API's @Roles(): SUPER_ADMIN can do everything. */
export function useCan() {
  const role = useSession((s) => s.admin?.role);
  return (...roles: Role[]) => role === 'SUPER_ADMIN' || (role !== undefined && roles.includes(role));
}
