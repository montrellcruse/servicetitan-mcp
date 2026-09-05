/**
 * V3 preserves names, precision, warnings, completeness, pagination and requested
 * detail. Presentation must be an explicit tool view, never a recursive guess
 * based on a property name. This compatibility entry point remains lossless.
 */
export function shapeResponse<T>(data: T): T {
  return data;
}
