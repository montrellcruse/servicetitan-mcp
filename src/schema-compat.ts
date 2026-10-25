import * as legacy from "zod/v3";

export * from "zod/v3";

/**
 * Keep the v3 validation/discovery contract while backporting the leading array
 * size gate from Zod 4.6.6 (GHSA-mrhx-c7xc-m3w5). The bundled v3 parser still
 * walks every child after a size failure. Never delegate an oversized array to it.
 */
export class ZodArray<T extends legacy.ZodTypeAny, Cardinality extends legacy.ArrayCardinality = "many"> extends legacy.ZodArray<T, Cardinality> {
  override _parse(input: legacy.ParseInput): legacy.ParseReturnType<this["_output"]> {
    if (Array.isArray(input.data)) {
      const exact = this._def.exactLength;
      const max = this._def.maxLength;
      const bound = exact && input.data.length > exact.value ? { ...exact, exact: true }
        : max && input.data.length > max.value ? { ...max, exact: false } : undefined;
      if (bound) {
        legacy.addIssueToContext(this._getOrReturnCtx(input), {
          code: legacy.ZodIssueCode.too_big,
          maximum: bound.value,
          type: "array",
          inclusive: true,
          exact: bound.exact,
          message: bound.message,
        });
        return legacy.INVALID;
      }
    }
    return super._parse(input);
  }

  // v3's size methods construct the base class, so retain the guarded parser
  // across every supported size-chain order, including nonempty().max().
  override min(value: number, message?: Parameters<legacy.ZodArray<T>["min"]>[1]): this {
    return new ZodArray(super.min(value, message)._def) as this;
  }
  override max(value: number, message?: Parameters<legacy.ZodArray<T>["max"]>[1]): this {
    return new ZodArray(super.max(value, message)._def) as this;
  }
  override length(value: number, message?: Parameters<legacy.ZodArray<T>["length"]>[1]): this {
    return new ZodArray(super.length(value, message)._def) as this;
  }
  override nonempty(message?: Parameters<legacy.ZodArray<T>["nonempty"]>[0]): ZodArray<T, "atleastone"> {
    return new ZodArray(super.min(1, message)._def);
  }
  override array(): ZodArray<this> {
    return ZodArray.create(this);
  }

  static override create = <T extends legacy.ZodTypeAny>(schema: T, params?: legacy.RawCreateParams): ZodArray<T> =>
    new ZodArray(legacy.ZodArray.create(schema, params)._def);
}

export const array = ZodArray.create;
