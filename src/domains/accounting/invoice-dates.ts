// ServiceTitan encodes the provider's invoice calendar day at UTC midnight.
export function isInvoiceCalendarTimestamp(key: string | undefined, value: string): boolean {
  return key === "invoiceDate" && /^\d{4}-\d{2}-\d{2}T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)$/.test(value);
}
