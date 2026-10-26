'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Copy, KeyRound, Lock, MoreHorizontal, Pencil, ShieldCheck, ShieldOff, Smartphone, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type AdminTempPassword, type AdminUserAccountRow } from '@goalbet/shared';
import { Alert, Badge, Button, Dialog, DialogContent, EmptyState, Field, Input, NativeSelect, cn } from '@goalbet/ui';
import { type Column, DataTable } from '@/components/ui/data-table';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page';
import { useCan, useErrorText } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi, useSession } from '@/lib/session';

const ROLES = ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'] as const;
type Role = (typeof ROLES)[number];
type Action = { kind: 'status' | 'password' | 'totp'; admin: AdminUserAccountRow };

/** Super admin: every admin account (create, edit, suspend, reset password or 2FA). */
export default function AdminsPage() {
  const t = useTranslations('admins');
  const tr = useTranslations('roles');
  const f = useFmt();
  const can = useCan();
  const me = useSession((s) => s.admin?.id);
  const qc = useQueryClient();
  const isSuper = can();
  const { data, isLoading } = useQuery({ queryKey: ['admins'], queryFn: () => adminApi<AdminUserAccountRow[]>('/admin/admins'), enabled: isSuper });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserAccountRow | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [temp, setTemp] = useState<AdminTempPassword | null>(null);

  if (!isSuper) {
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState icon={<Lock className="size-8" />} title={t('forbiddenTitle')}>
          {t('forbiddenHelp')}
        </EmptyState>
      </div>
    );
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });

  const columns: Column<AdminUserAccountRow>[] = [
    {
      key: 'admin',
      header: t('cols.admin'),
      cell: (a) => (
        <div className="flex items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold', a.status === 'ACTIVE' ? 'bg-brand-soft text-brand' : 'bg-tint/[0.06] text-ink-faint')}>
            {a.name
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {a.name}
              {a.id === me ? <span className="ml-1.5 text-xs font-normal text-ink-faint">({t('you')})</span> : null}
            </p>
            <p className="truncate text-xs text-ink-muted">{a.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: t('cols.role'), cell: (a) => <Badge tone={a.role === 'SUPER_ADMIN' ? 'boost' : a.role === 'FINANCE' ? 'info' : 'brand'}>{tr(a.role)}</Badge> },
    {
      key: 'status',
      header: t('cols.status'),
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={a.status === 'ACTIVE' ? 'success' : 'danger'}>{t(`status.${a.status}`)}</Badge>
          {a.locked ? <Badge tone="warning">{t('locked')}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'totp',
      header: t('cols.totp'),
      cell: (a) =>
        a.totpEnabled ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-success"><ShieldCheck className="size-4" aria-hidden="true" />{t('totpOn')}</span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold text-warning"><ShieldOff className="size-4" aria-hidden="true" />{t('totpPending')}</span>
        ),
      hideBelow: 'md',
    },
    { key: 'login', header: t('cols.lastLogin'), cell: (a) => <span className="text-sm text-ink-muted">{a.lastLoginAt ? f.ago(a.lastLoginAt) : t('never')}</span>, hideBelow: 'lg' },
    {
      key: 'actions',
      header: <span className="sr-only">{t('cols.actions')}</span>,
      align: 'right',
      cell: (a) => (
        <div className="relative inline-block text-left">
          <Button size="sm" variant="ghost" aria-label={t('cols.actions')} aria-expanded={menu === a.id} onClick={() => setMenu(menu === a.id ? null : a.id)} data-testid={`admin-menu-${a.email}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
          {menu === a.id ? (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-line-strong bg-card-solid py-1 text-left shadow-[var(--shadow-float)]" onMouseLeave={() => setMenu(null)}>
              {[
                { key: 'edit', icon: Pencil, run: () => setEditing(a), show: true },
                { key: a.status === 'ACTIVE' ? 'suspend' : 'activate', icon: a.status === 'ACTIVE' ? Ban : CheckCircle2, run: () => setAction({ kind: 'status', admin: a }), show: a.id !== me },
                { key: 'resetPassword', icon: KeyRound, run: () => setAction({ kind: 'password', admin: a }), show: a.id !== me },
                { key: 'resetTotp', icon: Smartphone, run: () => setAction({ kind: 'totp', admin: a }), show: a.id !== me && a.totpEnabled },
              ]
                .filter((i) => i.show)
                .map(({ key, icon: Icon, run }) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      run();
                    }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-tint/[0.06]', key === 'suspend' && 'text-danger')}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`actions.${key}`)}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  const actionCopy = action
    ? action.kind === 'status'
      ? action.admin.status === 'ACTIVE'
        ? { title: t('confirm.suspendTitle', { name: action.admin.name }), help: t('confirm.suspendHelp'), label: t('actions.suspend'), danger: true }
        : { title: t('confirm.activateTitle', { name: action.admin.name }), help: t('confirm.activateHelp'), label: t('actions.activate'), danger: false }
      : action.kind === 'password'
        ? { title: t('confirm.passwordTitle', { name: action.admin.name }), help: t('confirm.passwordHelp'), label: t('actions.resetPassword'), danger: false }
        : { title: t('confirm.totpTitle', { name: action.admin.name }), help: t('confirm.totpHelp'), label: t('actions.resetTotp'), danger: true }
    : null;

  return (
    <>
      <PageHeader
        kicker={t('kicker')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreating(true)} data-testid="admin-create">
            <UserPlus aria-hidden="true" />
            {t('add')}
          </Button>
        }
      />
      <DataTable testId="admins-table" columns={columns} rows={data ?? []} rowKey={(a) => a.id} loading={isLoading} />

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(res) => {
          setTemp(res);
          void refresh();
        }}
      />
      {editing ? <EditDialog admin={editing} isSelf={editing.id === me} onClose={() => setEditing(null)} onSaved={() => void refresh()} /> : null}
      <ReasonDialog
        open={!!action}
        onOpenChange={(o) => !o && setAction(null)}
        title={actionCopy?.title ?? ''}
        description={actionCopy?.help}
        confirmLabel={actionCopy?.label ?? ''}
        tone={actionCopy?.danger ? 'danger' : 'primary'}
        onConfirm={async (reason) => {
          const a = action!;
          if (a.kind === 'status') {
            await adminApi(`/admin/admins/${a.admin.id}/status`, { method: 'POST', body: { status: a.admin.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason } });
            toast.success(t(a.admin.status === 'ACTIVE' ? 'toast.suspended' : 'toast.activated'));
          } else if (a.kind === 'password') {
            setTemp(await adminApi<AdminTempPassword>(`/admin/admins/${a.admin.id}/reset-password`, { method: 'POST', body: { reason } }));
          } else {
            await adminApi(`/admin/admins/${a.admin.id}/reset-2fa`, { method: 'POST', body: { reason } });
            toast.success(t('toast.totpReset'));
          }
          await refresh();
        }}
      />
      <TempPasswordDialog value={temp} onClose={() => setTemp(null)} />
    </>
  );
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (r: AdminTempPassword) => void }) {
  const t = useTranslations('admins');
  const tr = useTranslations('roles');
  const tc = useTranslations('common2');
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('OPERATOR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('OPERATOR');
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await adminApi<AdminTempPassword>('/admin/admins', { method: 'POST', body: { name, email, role } }));
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('create.title')} description={t('create.help')} closeLabel={tc('close')}>
        <form onSubmit={submit} className="space-y-4" data-testid="admin-create-form">
          <Field label={t('fields.name')} htmlFor="new-admin-name">
            <Input id="new-admin-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </Field>
          <Field label={t('fields.email')} htmlFor="new-admin-email">
            <Input id="new-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('fields.role')} htmlFor="new-admin-role" hint={t(`roleHelp.${role}`)}>
            <NativeSelect id="new-admin-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {t('create.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ admin, isSelf, onClose, onSaved }: { admin: AdminUserAccountRow; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admins');
  const tr = useTranslations('roles');
  const tc = useTranslations('common2');
  const errorText = useErrorText();
  const [name, setName] = useState(admin.name);
  const [email, setEmail] = useState(admin.email);
  const [role, setRole] = useState<Role>(admin.role);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = { ...(name !== admin.name ? { name } : {}), ...(email !== admin.email ? { email } : {}), ...(role !== admin.role ? { role } : {}) };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(tc('reasonRequired'));
    setBusy(true);
    setError(null);
    try {
      await adminApi(`/admin/admins/${admin.id}`, { method: 'PATCH', body: { ...changed, reason: reason.trim() } });
      toast.success(t('toast.saved'));
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('edit.title')} description={admin.email} closeLabel={tc('close')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('fields.name')} htmlFor="edit-admin-name">
            <Input id="edit-admin-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('fields.email')} htmlFor="edit-admin-email" hint={t('edit.emailHelp')}>
            <Input id="edit-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('fields.role')} htmlFor="edit-admin-role" hint={isSelf ? t('edit.ownRole') : t(`roleHelp.${role}`)}>
            <NativeSelect id="edit-admin-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={tc('reason')} htmlFor="edit-admin-reason" hint={tc('reasonHint')}>
            <Input id="edit-admin-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={Object.keys(changed).length === 0}>
              {tc('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-time display of a temporary password, with copy. */
function TempPasswordDialog({ value, onClose }: { value: AdminTempPassword | null; onClose: () => void }) {
  const t = useTranslations('admins.temp');
  const tc = useTranslations('common2');
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [value]);
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('title')} description={value ? `${value.admin.name} · ${value.admin.email}` : undefined} closeLabel={tc('close')}>
        {value ? (
          <div className="space-y-4" data-testid="temp-password">
            <div className="flex items-center gap-2 rounded-xl bg-chrome-strong p-3 ring-1 ring-line">
              <code className="flex-1 break-all font-mono text-lg font-bold tracking-wider">{value.temporaryPassword}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(value.temporaryPassword);
                  setCopied(true);
                }}
              >
                <Copy aria-hidden="true" />
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
            <Alert tone="warning">{t('once')}</Alert>
            <p className="text-sm text-ink-muted">{t('next')}</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t('done')}</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
