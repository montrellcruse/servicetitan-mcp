import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { sendJson } from "./http-policy.js";
import type { Logger } from "./logger.js";
import type { ToolRegistry } from "./registry.js";
import { withRequestContext } from "./request-context.js";

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_REAP_INTERVAL_MS = 60 * 1000;
const SHUTDOWN_DEADLINE_MS = 10_000;
const DRAINING_ERROR = "Server is shutting down";

type SessionRuntime = {
  server: McpServer;
  registry: Pick<ToolRegistry, "hasActiveToolCalls">;
};

type Session = SessionRuntime & {
  id?: string;
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
  activeRequests: number;
};

type Handshake = { response: ServerResponse; requestId: string };

function isInitializeRequest(body: unknown): boolean {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    && (body as { method?: unknown }).method === "initialize";
}

function sessionHasWork(session: Session): boolean {
  // The SDK can keep a tool handler running after its HTTP response disconnects.
  return session.activeRequests > 0 || session.registry.hasActiveToolCalls;
}

function startsNewWork(message: unknown): boolean {
  if (message === null || typeof message !== "object") return false;
  const { method, params } = message as { method?: unknown; params?: { name?: unknown } };
  return method === "initialize" || (method === "tools/call" && params?.name !== "st_result_read");
}

/** Owns each reservation from admission through connection teardown. */
export class StreamableHttpSessions {
  private readonly pending = new Map<Session, Handshake>();
  private readonly sessions = new Map<string, Session>();
  private readonly reaper = setInterval(() => this.reapIdleSessions(), SESSION_REAP_INTERVAL_MS).unref();
  private draining = false;
  private closing = 0;
  private stopWhenEmpty?: () => void;

  constructor(
    private readonly maxSessions: number,
    private readonly createServer: () => SessionRuntime,
    private readonly logger: Logger,
  ) {}

  async handleRequest(req: IncomingMessage, res: ServerResponse, body: unknown, requestId: string): Promise<void> {
    const id = req.headers["mcp-session-id"];
    if (id) {
      const session = typeof id === "string" ? this.sessions.get(id) : undefined;
      if (!session) {
        sendJson(res, 404, { error: "Session not found. Send initialize request without session ID.", requestId });
        return;
      }
      if (this.draining && (req.method === "GET" || (Array.isArray(body) ? body : [body]).some(startsNewWork))) {
        sendJson(res, 503, { error: DRAINING_ERROR, requestId });
        return;
      }
      await this.dispatch(session, req, res, body);
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 400, { error: "Session ID required. Send initialize request via POST without session ID.", requestId });
      return;
    }
    if (!isInitializeRequest(body)) {
      sendJson(res, 400, { error: "New sessions must start with an initialize request.", requestId });
      return;
    }
    if (this.draining) {
      sendJson(res, 503, { error: DRAINING_ERROR, requestId });
      return;
    }
    if (this.sessions.size + this.pending.size >= this.maxSessions) {
      sendJson(res, 503, { error: "Session limit reached; close an existing session before retrying", requestId });
      return;
    }
    await this.initialize(req, res, body, requestId);
  }

  private async initialize(req: IncomingMessage, res: ServerResponse, body: unknown, requestId: string): Promise<void> {
    const { server, registry } = this.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: id => {
        if (this.pending.has(session)) session.id = id;
      },
    });
    const session: Session = { server, registry, transport, lastSeen: Date.now(), activeRequests: 0 };
    this.pending.set(session, { response: res, requestId });

    transport.onclose = () => {
      if (this.release(session, "client-disconnect")) this.stopWhenEmpty?.();
    };
    res.once("close", () => {
      if (this.pending.has(session)) void this.closeSession(session, "initialization-disconnected");
    });
    res.once("finish", () => {
      if (!this.pending.has(session)) return;
      if (this.draining || !session.id || res.statusCode !== 200) {
        void this.closeSession(session, "initialization-failed");
        return;
      }
      this.pending.delete(session);
      session.lastSeen = Date.now();
      this.sessions.set(session.id, session);
      this.logger.info("Session initialized", { sessionId: session.id, requestId });
    });

    try {
      await server.connect(transport);
      if (this.pending.has(session)) await transport.handleRequest(req, res, body);
    } catch (error) {
      await this.closeSession(session, "initialization-failed");
      throw error;
    }
  }

  private async dispatch(session: Session, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    session.lastSeen = Date.now();
    session.activeRequests += 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      session.activeRequests -= 1;
      session.lastSeen = Date.now();
    };
    res.once("finish", finish);
    res.once("close", finish);
    try {
      await withRequestContext({ drainingHttpSession: this.draining }, () => session.transport.handleRequest(req, res, body));
    } catch (error) {
      await this.closeSession(session, "transport-failed");
      throw error;
    } finally {
      if (res.writableEnded) finish();
    }
  }

  private release(session: Session, reason: string): boolean {
    const reserved = this.pending.delete(session);
    const id = session.id;
    const published = id !== undefined && this.sessions.get(id) === session;
    if (published) this.sessions.delete(id);
    if (reserved || published) this.logger.info("Closing session", { sessionId: id, reason });
    return reserved || published;
  }

  private async closeSession(session: Session, reason: string): Promise<void> {
    if (!this.release(session, reason)) return;
    this.closing += 1;
    try {
      // The SDK server closes its own transport once attached.
      if (session.server.server.transport === session.transport) await session.server.close();
      else await session.transport.close();
    } catch (error: unknown) {
      this.logger.warn("Failed to close session", {
        sessionId: session.id,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.closing -= 1;
      this.stopWhenEmpty?.();
    }
  }

  private reapIdleSessions(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (!sessionHasWork(session) && now - session.lastSeen > SESSION_IDLE_TTL_MS) {
        void this.closeSession(session, "idle-timeout");
      }
    }
  }

  shutdown(httpServer: Server, onClosed: (code: number) => void): void {
    if (this.draining) return;
    this.draining = true;
    clearInterval(this.reaper);
    this.logger.info("Shutdown signal received, draining HTTP sessions");

    let closingListener = false;
    let interruptedWork = false;
    const stopListening = () => {
      if (closingListener) return;
      closingListener = true;
      httpServer.close(error => {
        clearTimeout(deadline);
        onClosed(error || interruptedWork ? 1 : 0);
      });
    };
    const deadline = setTimeout(() => {
      interruptedWork = [...this.sessions.values()].some(sessionHasWork);
      if (interruptedWork) this.logger.error("HTTP drain deadline reached with unfinished requests");
      for (const session of this.sessions.values()) void this.closeSession(session, "shutdown-deadline");
      stopListening();
      httpServer.closeAllConnections();
    }, SHUTDOWN_DEADLINE_MS).unref();
    this.stopWhenEmpty = () => {
      if (this.pending.size === 0 && this.sessions.size === 0 && this.closing === 0) stopListening();
    };

    for (const [session, { response, requestId }] of this.pending) {
      void this.closeSession(session, "shutdown");
      if (response.writableEnded || response.destroyed) continue;
      if (!response.headersSent) sendJson(response, 503, { error: DRAINING_ERROR, requestId });
      else response.destroy();
    }
    // Keep the session available for result reads without keeping its idle stream open.
    for (const session of this.sessions.values()) session.transport.closeStandaloneSSEStream();
    this.stopWhenEmpty();
  }
}
