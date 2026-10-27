import { describe, expect, it } from 'vitest';
import { TemplateProvider } from '../src/modules/api-integration/template/provider.template.js';

describe('provider template', () => {
  it('implements OddsProvider: required feeds say what to implement, optional ones fall back to the engine', async () => {
    const p = new TemplateProvider();
    await expect(p.getFixtures(new Date(), new Date())).rejects.toThrow(/implement fixtures/);
    await expect(p.getResult('x')).rejects.toThrow(/official final result/);
    expect(await p.priceBetBuilder('x', [])).toBeNull();
    expect(await p.getCashOutValue('x')).toBeNull();
    expect(p.capabilities).toEqual({ betBuilderPricing: false, cashOutData: false });
  });
});
