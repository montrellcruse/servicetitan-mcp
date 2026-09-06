import { describe, expect, it } from 'vitest';
// @ts-expect-error Maintainer-only JavaScript audit utilities are intentionally unshipped.
import { compare, digest, summarize, validationSchema } from '../scripts/discovery-audit.mjs';

describe('description-only discovery compatibility audit', () => {
  const schema = { type: 'object', description: 'Old docs', properties: { description: { type: 'string', description: 'Field docs' } }, required: ['description'], default: { description: 'data' } };
  it('ignores schema prose while retaining fields and instance data named description', () => {
    const cleaned = validationSchema(schema);
    expect(cleaned).toEqual({ type: 'object', properties: { description: { type: 'string' } }, required: ['description'], default: { description: 'data' } });
    expect(digest(cleaned)).not.toBe(digest(validationSchema({ ...schema, required: [] })));
    expect(digest(cleaned)).not.toBe(digest(validationSchema({ ...schema, default: { description: 'changed data' } })));
  });
  const capture = (description = 'old', inputSchema = schema, names = ['example']) => ({ version: '3.0.0', configurations: { default: { env: {}, tools: names.map(name => ({ name, description, inputSchema, outputSchema: { type: 'object' }, annotations: { readOnlyHint: true } })) } } });
  it('accepts prose changes but rejects lost names and changed constraints', () => {
    const baseline = summarize(capture());
    expect(() => compare(baseline, summarize(capture('new', { ...schema, description: 'new' })))).not.toThrow();
    expect(() => compare(baseline, summarize(capture('new', { ...schema, required: [] })))).toThrow(/contract/);
    expect(() => compare(baseline, summarize(capture('new', schema, [])))).toThrow(/membership/);
  });
});

// @ts-expect-error The audit helper is an ESM release script.
import { normalize } from "../scripts/description-behavior-check.mjs";

it("erases literal tool prose while preserving executable source and instance data", () => {
  const original = `registry.register({name:"read", description:"Old", schema:{ id:z.number().default(42) }, handler:()=>client.get("/old") });`;
  const prose = original.replace('"Old"', '"New"').replace('z.number()', 'z.number().describe("Known ID")');
  expect(normalize(original,"fixture.ts")).toEqual(normalize(prose,"fixture.ts"));
  for (const changed of [original.replace('/old','/new'), original.replace('default(42)','default(43)'), original.replace('"Old"','getDescription()')]) {
    expect(normalize(changed,"fixture.ts")).not.toEqual(normalize(original,"fixture.ts"));
  }
  const value = `const input = z.object({}).default({description:"business data"});`;
  expect(normalize(value,"fixture.ts")).not.toEqual(normalize(value.replace('business data','different data'),"fixture.ts"));
});
