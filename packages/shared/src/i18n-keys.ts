/** Flatten nested message objects into dotted keys, e.g. { a: { b: 'x' } } -> ['a.b']. */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Keys present in one locale but not the other (F5.7 key-parity). */
export function keyParity(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ka = new Set(flattenKeys(a));
  const kb = new Set(flattenKeys(b));
  return {
    missingInB: [...ka].filter((k) => !kb.has(k)),
    missingInA: [...kb].filter((k) => !ka.has(k)),
  };
}
