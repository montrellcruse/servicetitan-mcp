import { mock } from "node:test";
import axios from "axios";

let releaseCustomer;
process.on("message", message => {
  if (message === "release-customer") {
    releaseCustomer?.();
  } else if (message === "freeze-clock") {
    mock.timers.enable({ apis: ["setTimeout"] });
    process.once("SIGINT", () => process.send("interrupt-seen"));
    process.send("clock-frozen");
  } else if (typeof message === "number") {
    mock.timers.tick(message);
    process.send("clock-advanced");
  }
});

axios.defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL);
  const respond = data => ({ status: 200, statusText: "OK", config, headers: {}, data });
  if (url.hostname === "auth-integration.servicetitan.io" && url.pathname === "/connect/token" && config.method === "post") {
    return respond({ access_token: "drain-fixture-token", expires_in: 900 });
  }

  const match = /^\/crm\/v2\/tenant\/42\/customers\/([789])$/.exec(url.pathname);
  if (url.hostname !== "api-integration.servicetitan.io" || config.method !== "get" || !match) {
    throw new Error("Wire drain fixture blocked an unexpected upstream request");
  }
  const id = Number(match[1]);
  if (id === 8) {
    const held = Promise.withResolvers();
    releaseCustomer = held.resolve;
    const cancel = () => {
      process.send({ upstreamAborted: id });
      held.reject(config.signal.reason);
    };
    config.signal.addEventListener("abort", cancel, { once: true });
    process.send({ upstreamStarted: id });
    try { await held.promise; }
    finally { config.signal.removeEventListener("abort", cancel); }
  }
  return respond({ id, name: "x".repeat(2000) });
};
