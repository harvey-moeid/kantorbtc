// Local workerd outbound traffic uses the environment proxy; production is unchanged.
import { resolve } from "node:path";
import { context } from "esbuild";
import {
  Miniflare,
  Response,
  WebSocketPair,
  coupleWebSocket,
  convertV4MiniflareOptions,
  fetch,
} from "miniflare";
import {
  unstable_getMiniflareWorkerOptions,
  unstable_readConfig,
} from "wrangler";
import { EnvHttpProxyAgent } from "undici";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import proxyFromEnv from "proxy-from-env";

const config = resolve(process.env.KANTOR_CONFIG || "wrangler.jsonc");
const port = Number(process.env.KANTOR_API_PORT || 8787);
const persistence = resolve(
  process.env.KANTOR_STATE_DIR || ".wrangler/state/v3",
);
const resolvedConfig = unstable_readConfig({ config });
const { workerOptions, main, define, externalWorkers } =
  unstable_getMiniflareWorkerOptions(resolvedConfig);
if (!main || externalWorkers.length)
  throw new Error("Local proxy runner expects one Worker with a main entry.");
const dispatcher = new EnvHttpProxyAgent();
const sockets = new Set();

async function outbound(request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return fetch(request, { dispatcher });
  }
  const url = new URL(request.url);
  const proxy = proxyFromEnv.getProxyForUrl(url.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const headers = Object.fromEntries(request.headers);
  const protocols = headers["sec-websocket-protocol"]
    ?.split(",")
    .map((value) => value.trim());
  delete headers["sec-websocket-protocol"];
  // Default TLS verification and inherited CA trust remain enabled, including at the proxy.
  const socket = new WebSocket(url, protocols, {
    headers,
    agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
    handshakeTimeout: 10000,
    followRedirects: false,
    perMessageDeflate: false,
  });
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  return new Promise((accept, reject) => {
    socket.once("error", () =>
      reject(new Error("Upstream WebSocket connection failed.")),
    );
    socket.once("unexpected-response", (_request, response) => {
      const status = response.statusCode || 502;
      response.resume();
      socket.terminate();
      accept(new Response(null, { status }));
    });
    socket.once("upgrade", async (response) => {
      const pair = new WebSocketPair();
      try {
        await coupleWebSocket(socket, pair[1]);
        accept(
          new Response(null, {
            status: 101,
            headers: response.headers,
            webSocket: pair[0],
          }),
        );
      } catch {
        socket.terminate();
        reject(new Error("Upstream WebSocket upgrade failed."));
      }
    });
  });
}

const options = (script) =>
  convertV4MiniflareOptions({
    ...workerOptions,
    // CI smoke tests always use demo, even when the production config is live.
    bindings: {
      ...workerOptions.bindings,
      ...(process.env.KANTOR_CI_DEMO === "1" ? { APP_MODE: "demo" } : {}),
    },
    name: resolvedConfig.name,
    // esbuild already resolves source modules into one ESM bundle.
    modulesRules: undefined,
    modules: true,
    script,
    host: "0.0.0.0",
    port,
    resourcePersistencePath: persistence,
    outboundService: outbound,
    // Local scans remain explicitly triggered rather than running AI automatically.
    cronTriggers: [],
    unsafeTriggerHandlers: true,
  });
let runtime;
const bundle = await context({
  entryPoints: [main],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  define,
  external: ["cloudflare:*", "node:*"],
  plugins: [
    {
      name: "reload-local-worker",
      setup(build) {
        build.onEnd(async (result) => {
          if (runtime && !result.errors.length) {
            await runtime.setOptions(options(result.outputFiles[0].text));
            console.log("Local Worker reloaded.");
          }
        });
      },
    },
  ],
});
const result = await bundle.rebuild();
runtime = new Miniflare(options(result.outputFiles[0].text));
await runtime.ready;
await bundle.watch();
console.log(
  `Local Worker ready at http://localhost:${port}; outbound proxy enabled.`,
);
console.log(
  "Restart after a frontend production build or editing Wrangler configuration/.dev.vars. Do not run another Worker on the same state directory.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const socket of sockets) socket.terminate();
  await bundle.dispose();
  await runtime.dispose();
  await dispatcher.close();
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
