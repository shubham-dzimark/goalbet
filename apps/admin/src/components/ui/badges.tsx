'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@goalbet/ui';

type Tone = 'neutral' | 'brand' | 'live' | 'boost' | 'success' | 'warning' | 'danger' | 'info';

const TICKET: Record<string, Tone> = {
  PENDING: 'warning',
  ACTIVE: 'info',
  LIVE: 'live',
  WON: 'success',
  LOST: 'danger',
  VOID: 'neutral',
  CASHED_OUT: 'boost',
  REJECTED: 'danger',
};
const LEG: Record<string, Tone> = { PENDING: 'neutral', WON: 'success', HALF_WON: 'success', LOST: 'danger', HALF_LOST: 'danger', VOID: 'neutral' };
const EVENT: Record<string, Tone> = { SCHEDULED: 'info', LIVE: 'live', FINISHED: 'neutral', CANCELLED: 'danger' };
const AUDIT: Record<string, Tone> = { ADMIN: 'brand', WALLET: 'boost', BETTING: 'info', SYSTEM: 'neutral' };

export function TicketStatusBadge({ status }: { status: string }) {
  const t = useTranslations('ticketStatus');
  return <Badge tone={TICKET[status] ?? 'neutral'}>{t(status)}</Badge>;
}

export function LegStatusBadge({ status }: { status: string }) {
  const t = useTranslations('legStatus');
  return <Badge tone={LEG[status] ?? 'neutral'}>{t(status)}</Badge>;
}

export function EventStatusBadge({ status }: { status: string }) {
  const t = useTranslations('eventStatus');
  return <Badge tone={EVENT[status] ?? 'neutral'}>{t(status)}</Badge>;
}

export function UserStatusBadge({ status }: { status: string }) {
  const t = useTranslations('users.status');
  return <Badge tone={status === 'ACTIVE' ? 'success' : 'danger'}>{t(status)}</Badge>;
}

export function AuditCategoryBadge({ category }: { category: string }) {
  const t = useTranslations('audit.categories');
  return <Badge tone={AUDIT[category] ?? 'neutral'}>{t(category)}</Badge>;
}

/** Ledger type with direction colour. */
export function TxTypeBadge({ type }: { type: string }) {
  const t = useTranslations('txType');
  const tone: Tone = type === 'STAKE' || type === 'ADMIN_DEBIT' ? 'neutral' : type === 'ADMIN_CREDIT' ? 'brand' : 'success';
  return <Badge tone={tone}>{t(type)}</Badge>;
}
