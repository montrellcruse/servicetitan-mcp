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
