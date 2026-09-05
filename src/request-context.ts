import { AsyncLocalStorage } from "node:async_hooks";

/** Settings and cancellation belong to one MCP invocation, never the process. */
export interface RequestContext {
  signal?: AbortSignal;
  timezone?: string;
  maxResponseChars?: number;
  /** Set by the registry only while an authorized mutation handler executes. */
  mutatingOperation?: boolean;
  /** Per-server/session bounded storage for results that cannot fit inline. */
  storeOversized?: (payload: unknown) => Record<string, unknown>;
}

const requestContext = new AsyncLocalStorage<Readonly<RequestContext>>();
const EMPTY_CONTEXT: Readonly<RequestContext> = Object.freeze({});

export function getRequestContext(): Readonly<RequestContext> {
  return requestContext.getStore() ?? EMPTY_CONTEXT;
}

export function withRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(Object.freeze({ ...getRequestContext(), ...context }), fn);
}

/** Compatibility for the old setters: changes only this async execution context. */
export function updateRequestContext(context: RequestContext): void {
  requestContext.enterWith(Object.freeze({ ...getRequestContext(), ...context }));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}

/** Abort one waiter without cancelling a shared operation used by other callers. */
export function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(new DOMException("Request cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
