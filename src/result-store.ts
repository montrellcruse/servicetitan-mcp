import { randomUUID } from "node:crypto";

/** Ephemeral, bounded storage owned by one MCP registry/session. Never written to disk. */
export class ResultStore {
  private readonly values = new Map<string, { text: string; bytes: number; expiresAt: number }>();
  constructor(private readonly maxBytes = 4_000_000, private readonly ttlMs = 300_000, private readonly now = Date.now) {}
  private prune(): void {
    for (const [id, value] of this.values) if (value.expiresAt <= this.now()) this.values.delete(id);
  }
  put(payload: unknown): Record<string, unknown> {
    this.prune();
    let text: string | undefined;
    try { text = JSON.stringify(payload); } catch { throw new Error("Result cannot be represented as JSON"); }
    if (typeof text !== "string") throw new Error("Result cannot be represented as JSON");
    const bytes = Buffer.byteLength(text);
    if (bytes > this.maxBytes) throw new Error("Result exceeds temporary storage limit; narrow the query or use source pagination");
    let used = [...this.values.values()].reduce((n, value) => n + value.bytes, 0);
    while (this.values.size >= 4 || used + bytes > this.maxBytes) {
      const oldest = this.values.keys().next().value;
      if (!oldest) break;
      used -= this.values.get(oldest)!.bytes;
      this.values.delete(oldest);
    }
    const resultId = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    this.values.set(resultId, { text, bytes, expiresAt });
    return { resultId, retrievalTool: "st_result_read", totalChars: text.length, expiresAt: new Date(expiresAt).toISOString() };
  }
  read(resultId: string, offset: number, maxChars: number): Record<string, unknown> {
    this.prune();
    const value = this.values.get(resultId);
    if (!value) throw new Error("Result is unavailable or expired. Inspect the resource with a read operation; do not repeat a completed mutation to retrieve its result.");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.text.length) throw new Error("Invalid result offset");
    if (!Number.isSafeInteger(maxChars) || maxChars <= 0) throw new Error("Invalid chunk size");
    const text = value.text.slice(offset, offset + maxChars);
    const nextOffset = offset + text.length;
    return { text, nextOffset: nextOffset < value.text.length ? nextOffset : null };
  }
  clear(): void { this.values.clear(); }
}
