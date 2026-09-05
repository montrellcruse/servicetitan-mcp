import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticated(req: IncomingMessage, key: string): boolean {
  if (!key) return false;
  const supplied = req.headers["x-api-key"];
  if (typeof supplied === "string" && safeCompare(supplied, key)) return true;
  const authorization = req.headers.authorization;
  return typeof authorization === "string" && /^Bearer /i.test(authorization) && safeCompare(authorization.slice(7), key);
}

/** Missing Origin is normal for native MCP clients. Browser origins require exact opt-in. */
export function allowedOrigin(req: IncomingMessage, configuredOrigin: string): boolean {
  const origin = req.headers.origin;
  return origin === undefined || (typeof origin === "string" && configuredOrigin !== "" && origin === configuredOrigin);
}

/** Validate the Host header, but never use it as a routing base or authenticated identity. */
export function requestUrl(req: IncomingMessage): URL {
  const host = req.headers.host;
  if (host !== undefined && (typeof host !== "string" || !host || /[\s/@\\?#]/.test(host))) throw new Error("Invalid Host header");
  if (host) {
    const parsed = new URL(`http://${host}`);
    if (parsed.pathname !== "/" || parsed.username || parsed.password) throw new Error("Invalid Host header");
  }
  const target = req.url ?? "/";
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\")) throw new Error("Invalid request target");
  return new URL(target, "http://localhost");
}

/** Identity represents the configured shared API credential, never caller-asserted request metadata. */
export function attachAuthenticatedPrincipal(req: IncomingMessage, clientId: string): void {
  (req as IncomingMessage & { auth: { token: string; clientId: string; scopes: string[] } }).auth = {
    token: "authenticated-shared-credential", clientId, scopes: [],
  };
}
