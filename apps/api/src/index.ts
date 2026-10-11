import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  settingsSchema,
  symbols,
  timeframes,
  type Candle,
  type Meeting,
  type Quote,
  type Signal,
} from "../../../packages/shared/src/domain";
import { encrypt, hashToken, verifyPassword } from "./security";
import { saveSettings, settings, slots } from "./data";
import { defaultSlots, providerNames, type Env } from "./env";
import { marketCandles, persistCandles } from "./market";
import { safeWebhook } from "./notifications";
import { createBackfill } from "./backfill";
import { testProvider } from "./provider-test";
export { MarketHub } from "./hub";
const app = new Hono<{
  Bindings: Env;
  Variables: { sessionHash: string; sessionExpiry: number };
}>();
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 16384,
    onError: (c) => c.json({ error: "Payload terlalu besar." }, 413),
  }),
);
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
});
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin"),
      expected = new URL(c.req.url).origin;
    if (
      (origin && origin !== expected) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    )
      return c.json({ error: "Permintaan lintas origin ditolak." }, 403);
    if (new URL(c.req.url).protocol === "https:" && !origin)
      return c.json({ error: "Origin dibutuhkan untuk perubahan data." }, 403);
  }
  await next();
});
async function session(
  env: Env,
  token?: string,
): Promise<{ token_hash: string; expires_at: number } | null> {
  if (!token || token.length !== 64) return null;
  return env.DB.prepare(
    "SELECT token_hash,expires_at FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hashToken(token), Date.now())
    .first();
}
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    app: "kantor",
    mode: c.env.APP_MODE,
    version: "0.1.0",
  }),
);
app.get("/api/auth/session", async (c) =>
  c.json({
    authenticated: !!(await session(c.env, getCookie(c, "kantor_session"))),
  }),
);
app.post("/api/auth/login", async (c) => {
  const parsed = z
    .object({ password: z.string().min(1).max(256) })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Password diperlukan." }, 400);
  let user = await c.env.DB.prepare(
    "SELECT id,password_hash FROM users WHERE id='owner'",
  ).first<{ id: string; password_hash: string }>();
  if (!user && c.env.ADMIN_PASSWORD_HASH) {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO users(id,password_hash,created_at) VALUES('owner',?,?)",
    )
      .bind(c.env.ADMIN_PASSWORD_HASH, Date.now())
      .run();
    user = { id: "owner", password_hash: c.env.ADMIN_PASSWORD_HASH };
  }
  if (!user)
    return c.json(
      {
        error:
          "Login belum dikonfigurasi. Atur password backend atau jelajahi demo.",
      },
      503,
    );
  const ip = await hashToken(c.req.header("CF-Connecting-IP") || "local"),
    now = Date.now();
  const row = await c.env.DB.prepare(
    "INSERT INTO login_attempts(id,attempts,window_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window_at<? THEN 1 ELSE attempts+1 END,window_at=CASE WHEN window_at<? THEN excluded.window_at ELSE window_at END RETURNING attempts",
  )
    .bind(ip, now, now - 900000, now - 900000)
    .first<{ attempts: number }>();
  if ((row?.attempts || 0) > 8) {
    c.header("Retry-After", "900");
    return c.json(
      { error: "Terlalu banyak percobaan. Coba lagi setelah 15 menit." },
      429,
    );
  }
  if (!(await verifyPassword(parsed.data.password, user.password_hash)))
    return c.json({ error: "Password tidak valid." }, 401);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join(""),
    expires = now + 86400000;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    ).bind(await hashToken(token), "owner", expires),
    c.env.DB.prepare("DELETE FROM login_attempts WHERE id=?").bind(ip),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
  ]);
  setCookie(c, "kantor_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 86400,
  });
  return c.json({ authenticated: true });
});
app.get("/api/public/status", (c) =>
  c.json({ mood: "tenang", meeting: "idle" }),
);
app.get("/api/public/stream", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket")
    return c.json({ error: "WebSocket required" }, 426);
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: "Origin ditolak." }, 403);
  const hub = c.env.MARKET_HUB.get(c.env.MARKET_HUB.idFromName("office"));
  return hub.fetch(
    new Request(`https://hub/ws?public=1&expires=${Date.now() + 3600000}`, {
      headers: { Upgrade: "websocket" },
    }),
  );
});
app.use("/api/*", async (c, next) => {
  const found = await session(c.env, getCookie(c, "kantor_session"));
  if (!found) return c.json({ error: "Login diperlukan." }, 401);
  c.set("sessionHash", found.token_hash);
  c.set("sessionExpiry", found.expires_at);
  await next();
});
app.post("/api/auth/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("sessionHash"))
    .run();
  deleteCookie(c, "kantor_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/stream", (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket")
    return c.json({ error: "WebSocket required" }, 426);
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: "Origin ditolak." }, 403);
  const hub = c.env.MARKET_HUB.get(c.env.MARKET_HUB.idFromName("office"));
  return hub.fetch(
    new Request(
      `https://hub/ws?expires=${c.get("sessionExpiry")}&token=${c.get("sessionHash")}`,
      { headers: { Upgrade: "websocket" } },
    ),
  );
});
app.get("/api/market", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT value_json FROM quotes",
  ).all<{ value_json: string }>();
  const quotes = results
    .map((r) => JSON.parse(r.value_json) as Quote)
    .map((q) => ({
      ...q,
      status:
        Date.now() - q.at > 45000 && q.status !== "closed" ? "stale" : q.status,
    }));
  return c.json({ quotes });
});
app.get("/api/market/:symbol/candles", async (c) => {
  const parsed = z
    .object({
      symbol: z.enum(symbols),
      tf: z.enum(timeframes),
      limit: z.coerce.number().int().min(1).max(1000),
    })
    .safeParse({
      symbol: c.req.param("symbol").toUpperCase(),
      tf: c.req.query("tf") || "H1",
      limit: c.req.query("limit") || 300,
    });
  if (!parsed.success)
    return c.json({ error: "Aset, timeframe, atau limit tidak valid." }, 400);
  const { symbol, tf, limit } = parsed.data;
  let rows = await c.env.DB.prepare(
    "SELECT time,open,high,low,close,volume FROM candles WHERE symbol=? AND tf=? ORDER BY time DESC LIMIT ?",
  )
    .bind(symbol, tf, limit)
    .all<Candle>();
  if (rows.results.length < 50 && c.env.APP_MODE === "live") {
    try {
      const fresh = await marketCandles(c.env, symbol, tf);
      await persistCandles(c.env, symbol, tf, fresh);
      rows = await c.env.DB.prepare(
        "SELECT time,open,high,low,close,volume FROM candles WHERE symbol=? AND tf=? ORDER BY time DESC LIMIT ?",
      )
        .bind(symbol, tf, limit)
        .all<Candle>();
    } catch {
      return c.json(
        {
          error:
            "Sumber data belum tersedia. Periksa kredensial dan konektivitas.",
        },
        503,
      );
    }
  }
  return c.json({ candles: rows.results.reverse() });
});
app.get("/api/market/:symbol/derivatives", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  if (!symbols.includes(symbol as (typeof symbols)[number]))
    return c.json({ error: "Aset tidak valid." }, 400);
  const { results } = await c.env.DB.prepare(
    "SELECT at,source,funding,open_interest,oi_change,is_proxy FROM derivatives WHERE symbol=? ORDER BY at DESC LIMIT 96",
  )
    .bind(symbol)
    .all();
  return c.json({ snapshots: results });
});
app.get("/api/signals", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT value_json FROM signals ORDER BY created_at DESC LIMIT 200",
  ).all<{ value_json: string }>();
  const list = results.map((r) => JSON.parse(r.value_json) as Signal);
  return c.json({
    signals: list.filter(
      (s) =>
        (!c.req.query("symbol") || s.symbol === c.req.query("symbol")) &&
        (!c.req.query("status") || s.status === c.req.query("status")),
    ),
  });
});
app.get("/api/signals/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT value_json FROM signals WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ value_json: string }>();
  return row
    ? c.json({ signal: JSON.parse(row.value_json) })
    : c.json({ error: "Sinyal tidak ditemukan." }, 404);
});
app.get("/api/meetings", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT value_json FROM meetings ORDER BY at DESC LIMIT 100",
  ).all<{ value_json: string }>();
  return c.json({
    meetings: results.map((r) => JSON.parse(r.value_json) as Meeting),
  });
});
app.get("/api/settings/scanner", async (c) => c.json(await settings(c.env)));
app.put("/api/settings/scanner", async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json());
  if (!parsed.success)
    return c.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      400,
    );
  const version = await saveSettings(c.env, "scanner", parsed.data);
  return c.json({ settings: parsed.data, version });
});
app.get("/api/settings/ai", async (c) => c.json({ slots: await slots(c.env) }));
app.put("/api/settings/ai", async (c) => {
  const parsed = z
    .object({
      slots: z
        .array(
          z.object({
            provider: z.enum([
              "Workers AI",
              "Gemini",
              "Groq",
              "OpenRouter",
              "Mistral",
              "Hugging Face",
              "Cohere",
              "NVIDIA",
            ]),
            model: z.string().min(1).max(160),
          }),
        )
        .length(4),
    })
    .safeParse(await c.req.json());
  if (!parsed.success)
    return c.json({ error: "Empat slot provider/model wajib valid." }, 400);
  await saveSettings(c.env, "ai", parsed.data.slots);
  return c.json(parsed.data);
});
app.get("/api/settings/api", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT provider,last4,enabled,updated_at,test_status,tested_at FROM api_credentials",
  ).all();
  return c.json({ credentials: results, workersAI: !!c.env.AI });
});
app.put("/api/settings/api/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!providerNames.includes(provider) || provider === "Workers AI")
    return c.json({ error: "Provider tidak valid." }, 400);
  const parsed = z
    .object({ value: z.string().min(5).max(4096) })
    .safeParse(await c.req.json());
  if (
    !parsed.success ||
    (provider === "Discord" && !safeWebhook(parsed.data.value))
  )
    return c.json(
      {
        error:
          "Key atau webhook tidak valid. Webhook harus https://discord.com/api/webhooks/…",
      },
      400,
    );
  if (!c.env.ENCRYPTION_KEY)
    return c.json(
      { error: "ENCRYPTION_KEY belum dikonfigurasi pada Worker." },
      503,
    );
  const value = parsed.data.value,
    encrypted = await encrypt(value, c.env.ENCRYPTION_KEY),
    now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO api_credentials(provider,ciphertext,last4,updated_at) VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET ciphertext=excluded.ciphertext,last4=excluded.last4,updated_at=excluded.updated_at,test_status='untested',tested_at=NULL",
    ).bind(provider, encrypted, value.slice(-4), now),
    c.env.DB.prepare(
      "INSERT INTO settings_audit(id,category,old_json,new_json,version,at) VALUES(?,?,NULL,?,1,?)",
    ).bind(
      crypto.randomUUID(),
      "credential",
      JSON.stringify({ provider, action: "replace" }),
      now,
    ),
  ]);
  return c.json({ provider, last4: value.slice(-4), saved: true });
});
app.post("/api/settings/api/:provider/test", async (c) => {
  const provider = c.req.param("provider");
  if (!providerNames.includes(provider))
    return c.json({ error: "Provider tidak valid." }, 400);
  const result = await testProvider(c.env, provider);
  await c.env.DB.prepare(
    "UPDATE api_credentials SET test_status=?,tested_at=? WHERE provider=?",
  )
    .bind(result.status, Date.now(), provider)
    .run();
  return c.json(result);
});
app.get("/api/alerts", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id,symbol,price,enabled,fired FROM alerts ORDER BY created_at DESC LIMIT 100",
  ).all();
  return c.json({ alerts: results });
});
app.post("/api/alerts", async (c) => {
  const parsed = z
    .object({ symbol: z.enum(symbols), price: z.number().positive().finite() })
    .safeParse(await c.req.json());
  if (!parsed.success)
    return c.json({ error: "Aset atau harga alert tidak valid." }, 400);
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM alerts",
  ).first<{ total: number }>();
  if ((count?.total || 0) >= 100)
    return c.json({ error: "Maksimal 100 alert." }, 409);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO alerts(id,symbol,price,created_at) VALUES(?,?,?,?)",
  )
    .bind(id, parsed.data.symbol, parsed.data.price, Date.now())
    .run();
  return c.json({ id, ...parsed.data, enabled: true }, 201);
});
app.delete("/api/alerts/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM alerts WHERE id=?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.get("/api/audit", async (c) => {
  const settings = await c.env.DB.prepare(
    "SELECT id,category,version,at FROM settings_audit ORDER BY at DESC LIMIT 100",
  ).all();
  const sources = await c.env.DB.prepare(
    "SELECT * FROM source_events ORDER BY at DESC LIMIT 100",
  ).all();
  const alerts = await c.env.DB.prepare(
    "SELECT id,status,attempts,created_at,sent_at FROM alert_outbox ORDER BY created_at DESC LIMIT 100",
  ).all();
  return c.json({
    settings: settings.results,
    sources: sources.results,
    alerts: alerts.results,
  });
});
app.get("/api/backfill", async (c) =>
  c.json({
    jobs: (
      await c.env.DB.prepare(
        "SELECT * FROM backfill_jobs ORDER BY updated_at DESC LIMIT 100",
      ).all()
    ).results,
  }),
);
app.post("/api/backfill", async (c) => {
  const parsed = z
    .object({
      symbol: z.enum(symbols),
      from: z.number().int().positive(),
      to: z.number().int().positive(),
    })
    .refine(
      (d) =>
        d.to > d.from && d.to - d.from <= 31622400 && d.to <= Date.now() / 1000,
      { message: "Rentang harus di masa lalu, maksimal satu tahun." },
    )
    .safeParse(await c.req.json());
  if (!parsed.success)
    return c.json(
      { error: "Aset atau rentang backfill tidak valid; maksimal satu tahun." },
      400,
    );
  if (c.env.APP_MODE !== "live")
    return c.json(
      { error: "Backfill membutuhkan mode live dan akses provider." },
      409,
    );
  const pending = await c.env.DB.prepare(
    "SELECT id FROM backfill_jobs WHERE symbol=? AND status='pending'",
  )
    .bind(parsed.data.symbol)
    .first();
  if (pending)
    return c.json({ error: "Backfill aset ini masih berjalan." }, 409);
  await createBackfill(
    c.env,
    parsed.data.symbol,
    parsed.data.from,
    parsed.data.to,
  );
  const hub = c.env.MARKET_HUB.get(c.env.MARKET_HUB.idFromName("office"));
  c.executionCtx.waitUntil(hub.fetch("https://hub/scan", { method: "POST" }));
  return c.json({ started: true }, 202);
});
app.post("/api/backfill/:id/resume", async (c) => {
  if (c.env.APP_MODE !== "live")
    return c.json({ error: "Mode live dibutuhkan." }, 409);
  await c.env.DB.prepare(
    "UPDATE backfill_jobs SET status='pending',error=NULL,updated_at=? WHERE id=? AND status='failed'",
  )
    .bind(Date.now(), c.req.param("id"))
    .run();
  return c.json({ resumed: true });
});
app.all("/api/*", (c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((err, c) => {
  if (err instanceof SyntaxError)
    return c.json({ error: "JSON tidak valid." }, 400);
  return c.json(
    { error: "Operasi gagal. Periksa migrasi D1 dan konfigurasi Worker." },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (env.APP_MODE !== "live") return;
    const hub = env.MARKET_HUB.get(env.MARKET_HUB.idFromName("office"));
    ctx.waitUntil(hub.fetch("https://hub/scan", { method: "POST" }));
  },
};
export { app, defaultSlots };
