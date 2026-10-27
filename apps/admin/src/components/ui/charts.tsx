'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFmt } from '@/lib/format';

const AXIS = { stroke: 'var(--color-ink-faint)', fontSize: 11, tickLine: false, axisLine: false } as const;
const TOOLTIP = {
  contentStyle: { background: 'var(--color-card-solid)', border: '1px solid var(--color-line-strong)', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: 'var(--color-ink-muted)', marginBottom: 4 },
  itemStyle: { color: 'var(--color-ink)' },
  cursor: { stroke: 'var(--color-line-strong)' },
} as const;

/** Stakes vs payouts per day (emerald = money in, gold = money out). */
export function MoneyTrendChart({ data, height = 260 }: { data: { date: string; stakesBani: number; payoutsBani: number }[]; height?: number }) {
  const t = useTranslations('charts');
  return (
    <TwoSeriesBars
      data={data}
      height={height}
      label={t('trendLabel')}
      series={[
        { key: 'stakesBani', label: t('stakes') },
        { key: 'payoutsBani', label: t('payouts') },
      ]}
    />
  );
}

/** Deposits vs withdrawals paid per day. */
export function PaymentsTrendChart({ data, height = 260 }: { data: { date: string; depositsBani: number; withdrawalsBani: number }[]; height?: number }) {
  const t = useTranslations('charts');
  return (
    <TwoSeriesBars
      data={data}
      height={height}
      label={t('paymentsLabel')}
      series={[
        { key: 'depositsBani', label: t('deposits') },
        { key: 'withdrawalsBani', label: t('withdrawals') },
      ]}
    />
  );
}

/** Money per day as two bar series: emerald (first) and gold (second). */
type Series = { key: string; label: string };

function TwoSeriesBars({
  data,
  height,
  label,
  series,
}: {
  data: ({ date: string } & Record<string, string | number>)[];
  height: number;
  label: string;
  series: [Series, Series];
}) {
  const f = useFmt();
  const [a, b] = series;
  return (
    <div role="img" aria-label={label}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap={data.length > 40 ? '10%' : '24%'}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={f.shortDay} {...AXIS} minTickGap={16} />
            <YAxis tickFormatter={(v: number) => f.compactRon(v)} width={70} {...AXIS} />
            <Tooltip
              {...TOOLTIP}
              cursor={{ fill: 'var(--color-line)' }}
              labelFormatter={(d) => f.shortDay(String(d))}
              formatter={(v, name) => [f.ron(Number(v)), name === a.key ? a.label : b.label]}
            />
            <Bar dataKey={a.key} fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey={b.key} fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex justify-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand" />
          {a.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" />
          {b.label}
        </span>
      </div>
    </div>
  );
}

/** Horizontal bars, e.g. tickets per status. */
export function CountBars({ data, height = 240 }: { data: { label: string; value: number; color: string }[]; height?: number }) {
  const t = useTranslations('charts');
  return (
    <div style={{ height }} role="img" aria-label={t('barsLabel')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="label" width={96} {...AXIS} />
          <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--color-line)' }} formatter={(v) => [String(v), t('tickets')]} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
