import { z } from 'zod';
import { PAYMENT_METHODS, PAYMENT_REQUEST_STATUSES } from '../enums.js';

/** "RO49 aaaa 1b31…" → "RO49AAAA1B31…" */
export const normaliseIban = (v: string) => v.replace(/\s+/g, '').toUpperCase();

/** IBAN format + ISO 13616 mod-97 checksum (catches typos before Finance sees them). */
export function isValidIban(raw: string): boolean {
  const iban = normaliseIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('RO') && iban.length !== 24) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const bani = z.number().int().positive({ message: 'validation.amount' });
const method = z.enum(PAYMENT_METHODS as [string, ...string[]]);

/** Player request: deposit (how they pay) or withdrawal (where to pay out). */
export const paymentRequestCreateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DEPOSIT'),
    method,
    amountBani: bani,
    /** optional: the reference/receipt number the player used */
    payerReference: z.string().trim().max(60).optional(),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('WITHDRAWAL'),
    method,
    amountBani: bani,
    iban: z.string().trim().optional(),
    accountHolder: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
  }),
]).superRefine((v, ctx) => {
  // bank payouts need valid account details
  if (v.type === 'WITHDRAWAL' && v.method === 'BANK_TRANSFER') {
    if (!v.iban || !isValidIban(v.iban)) ctx.addIssue({ code: 'custom', path: ['iban'], message: 'validation.iban' });
    if (!v.accountHolder || v.accountHolder.length < 3) ctx.addIssue({ code: 'custom', path: ['accountHolder'], message: 'validation.holder' });
  }
});
export type PaymentRequestCreateInput = z.input<typeof paymentRequestCreateSchema>;

export const paymentRequestQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminPaymentQuerySchema = z.object({
  status: z.enum(PAYMENT_REQUEST_STATUSES as [string, ...string[]]).optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
  /** reference code or player email */
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const adminPaymentApproveSchema = z.object({ note: z.string().trim().max(300).optional() });
export const adminPaymentRejectSchema = z.object({ note: z.string().trim().min(3, { message: 'validation.reason' }).max(300) });
