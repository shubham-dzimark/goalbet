import { Body, type PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DomainError } from './errors.js';

/** Validates input with a Zod schema; failures become VALIDATION_FAILED with per-field i18n keys. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const r = this.schema.safeParse(value);
    if (r.success) return r.data;
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message.startsWith('validation.') ? issue.message : 'validation.required';
    }
    throw new DomainError('VALIDATION_FAILED', { fields });
  }
}

export function zodToOpenApi(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json['$schema'];
  return json;
}

type ParamDecoratorTarget = object;

function applyMethodDecorator(target: ParamDecoratorTarget, key: string | symbol | undefined, deco: MethodDecorator) {
  if (key === undefined) return;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor) deco(target, key, descriptor);
}

/** @Body validated by Zod, documented in Swagger from the same schema. */
export function ZBody(schema: z.ZodType): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    applyMethodDecorator(target, key, ApiBody({ schema: zodToOpenApi(schema) }));
  };
}

/** @Query validated by Zod; each top-level property is documented as a query parameter. */
export function ZQuery(schema: z.ZodObject): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodValidationPipe(schema))(target, key, index);
    for (const [name, prop] of Object.entries(schema.shape)) {
      applyMethodDecorator(
        target,
        key,
        ApiQuery({ name, required: !(prop as z.ZodType).safeParse(undefined).success, schema: zodToOpenApi(prop as z.ZodType) }),
      );
    }
  };
}
