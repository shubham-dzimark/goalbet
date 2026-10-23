import { z } from 'zod';
import { LOCALES } from '../enums.js';

/**
 * Zod schemas shared by API (validation) and frontends (forms).
 * Issue messages are i18n keys under "validation.*".
 */

export const MIN_AGE = 18;

/** Normalise a Romanian or international phone number to E.164; null when invalid. */
export function normalizePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '');
  if (/^07\d{8}$/.test(s)) return `+4${s}`;
  if (/^0040\d{9}$/.test(s)) return `+${s.slice(2)}`;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

/** Age in whole years at `today` for an ISO date (YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: 'validation.email' }));

export const passwordSchema = z
  .string()
  .min(8, { message: 'validation.passwordLength' })
  .max(128, { message: 'validation.passwordLength' })
  .regex(/[A-Za-z]/, { message: 'validation.passwordLetter' })
  .regex(/\d/, { message: 'validation.passwordDigit' });

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'validation.phone' });
      return z.NEVER;
    }
    return p;
  });

export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date' })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { message: 'validation.date' })
  .refine((v) => ageOn(v) >= MIN_AGE, { message: 'validation.underage' });

export const localeSchema = z.enum(LOCALES as ['ro', 'en']);

/** F1.3 — fields exactly Name, Email, Phone, Password (+ date of birth and terms). */
export const registerSchema = z.object({
  name: z.string().trim().min(2, { message: 'validation.name' }).max(80, { message: 'validation.name' }),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  dateOfBirth: dateOfBirthSchema,
  acceptTerms: z.literal(true, { message: 'validation.terms' }),
  locale: localeSchema.optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'validation.required' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, { message: 'validation.required' }),
  password: passwordSchema,
});

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'validation.required' }),
  totp: z
    .string()
    .regex(/^\d{6}$/, { message: 'validation.totp' })
    .optional(),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const updateProfileSchema = z.object({
  name: registerSchema.shape.name.optional(),
  phone: phoneSchema.optional(),
  locale: localeSchema.optional(),
});
