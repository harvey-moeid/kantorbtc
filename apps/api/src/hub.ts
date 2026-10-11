import {
  symbols,
  timeframes,
  type Candle,
  type Meeting,
  type Quote,
  type Signal,
} from "../../../packages/shared/src/domain";
import {
  scan,
  scannerCandidates,
  decide,
  makeSignal,
  advanceSignal,
} from "../../../packages/shared/src/engine";
import type { Env } from "./env";
import { settings, slots } from "./data";
import { callSlot } from "./ai";
import { marketCandles, marketQuote, persistCandles } from "./market";
import { enqueue, flushOutbox } from "./notifications";
import { backfillChunk, initialBackfill } from "./backfill";
import { BtcFeed } from "./btc-feed";
import { derivatives } from "./derivatives";
import {
  publicMeetingEvent,
  type PublicOfficeEvent,
} from "../../../packages/shared/src/stream";
export class MarketHub {
  private running = false;
  private lastMood: NonNullable<PublicOfficeEvent["mood"]> = "tenang";
  private feed: BtcFeed;
  private tickQueue: Promise<void> = Promise.resolve();
  private previousBtc: Quote | null = null;
  private lastPersist = 0;
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.feed = new BtcFeed((quote) => {
      this.tickQueue = this.tickQueue
        .then(async () => {
          const previous = this.previousBtc;
          this.previousBtc = quote;
          if (Date.now() - this.lastPersist >= 1000) {
            this.lastPersist = Date.now();
            await this.persistQuote(quote);
          }
          await this.trackSignals(quote, previous);
          await this.broadcast(
            {
              type: "mood",
              mood: previous
                ? quote.price > previous.price
                  ? "naik"
                  : quote.price < previous.price
                    ? "turun"
                    : "tenang"
                : "tenang",
            },
            { type: "tick", quote },
          );
        })
        .catch(() => {});
      this.state.waitUntil(this.tickQueue);
    });
  }
  private async persistQuote(quote: Quote) {
    await this.env.DB.prepare(
      "INSERT INTO quotes(symbol,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
    )
      .bind(quote.symbol, JSON.stringify(quote), Date.now())
      .run();
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (this.state.getWebSockets().length >= 128)
        return new Response("Connection limit", { status: 429 });
      const pair = new WebSocketPair(),
        client = pair[0],
        server = pair[1],
        publicView = url.searchParams.get("public") === "1";
      this.state.acceptWebSocket(server, [publicView ? "public" : "private"]);
      server.serializeAttachment({
        expiresAt: Number(
          url.searchParams.get("expires") || Date.now() + 3600000,
        ),
        tokenHash: url.searchParams.get("token"),
      });
      const current = await this.state.storage.get<{
        details: Meeting;
        at: number;
      }>("current-meeting");
      const active =
        current &&
        Date.now() - current.at < 300000 &&
        ["scanner", "ai", "rr"].includes(current.details.phase);
      const snapshot = active
        ? publicView
          ? publicMeetingEvent(current.details, current.at)
          : { type: "meeting", meeting: current.details, at: current.at }
        : publicView
          ? { type: "mood", mood: this.lastMood, meeting: "idle" }
          : { type: "refresh" };
      server.send(JSON.stringify(snapshot));
      if (!(await this.state.storage.getAlarm()))
        await this.state.storage.setAlarm(Date.now() + 1000);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/scan" && request.method === "POST") {
      if (this.running) return Response.json({ status: "running" });
      this.running = true;
      this.state.waitUntil(
        this.round().finally(() => {
          this.running = false;
        }),
      );
      return Response.json({ status: "started" });
    }
    return new Response("Not found", { status: 404 });
  }
  async broadcast(publicEvent: PublicOfficeEvent, privateEvent?: unknown) {
    if (publicEvent.mood) this.lastMood = publicEvent.mood;
    const message =
      privateEvent &&
      typeof privateEvent === "object" &&
      (privateEvent as { type?: string }).type === "tick"
        ? { ...privateEvent, mood: this.lastMood }
        : privateEvent;
    for (const socket of this.state.getWebSockets()) {
      try {
        const attachment = socket.deserializeAttachment() as {
          expiresAt: number;
          tokenHash?: string;
        };
        if (attachment.expiresAt < Date.now()) {
          socket.close(1008, "Session expired");
          continue;
        }
        const isPublic = this.state.getTags(socket).includes("public");
        if (!isPublic) {
          const session = await this.env.DB.prepare(
            "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
          )
            .bind(attachment.tokenHash || "", Date.now())
            .first();
          if (!session) {
            socket.close(1008, "Session revoked");
            continue;
          }
        }
        socket.send(
          JSON.stringify(
            isPublic
              ? publicEvent
              : message || {
                  type: "refresh",
                  meeting: publicEvent.meeting,
                },
          ),
        );
      } catch {
        socket.close();
      }
    }
  }
  async alarm() {
    if (this.env.APP_MODE === "live") {
      await this.feed.maintain();
      for (const symbol of symbols) {
        if (symbol === "BTCUSDT" && this.feed.latest) continue;
        try {
          const previous = await this.env.DB.prepare(
              "SELECT value_json FROM quotes WHERE symbol=?",
            )
              .bind(symbol)
              .first<{ value_json: string }>(),
            old: Quote | null = previous
              ? JSON.parse(previous.value_json)
              : null,
            quote = await marketQuote(this.env, symbol);
          if (old && old.source !== quote.source)
            await this.env.DB.prepare(
              "INSERT INTO source_events(id,symbol,from_source,to_source,reason,at) VALUES(?,?,?,?,?,?)",
            )
              .bind(
                crypto.randomUUID(),
                symbol,
                old.source,
                quote.source,
                "Source fallback/recovery",
                Date.now(),
              )
              .run();
          await this.persistQuote(quote);
          await this.broadcast(
            {
              type: "mood",
              mood: old
                ? quote.price > old.price
                  ? "naik"
                  : quote.price < old.price
                    ? "turun"
                    : "tenang"
                : "tenang",
            },
            { type: "tick", quote },
          );
          if (quote.status !== "closed" && Date.now() - quote.at < 45000)
            await this.trackSignals(quote, old);
        } catch {
          const row = await this.env.DB.prepare(
            "SELECT value_json FROM quotes WHERE symbol=?",
          )
            .bind(symbol)
            .first<{ value_json: string }>();
          if (row) {
            const quote = JSON.parse(row.value_json) as Quote;
            quote.status = "stale";
            await this.env.DB.prepare(
              "UPDATE quotes SET value_json=? WHERE symbol=?",
            )
              .bind(JSON.stringify(quote), symbol)
              .run();
          }
        }
      }
      await this.expireSignals();
      await backfillChunk(this.env);
      await flushOutbox(this.env);
    }
    await this.broadcast({ type: "mood", mood: this.lastMood });
    if (this.state.getWebSockets().length || this.env.APP_MODE === "live")
      await this.state.storage.setAlarm(Date.now() + 15000);
  }
  private async trackSignals(quote: Quote, previous: Quote | null) {
    const { results } = await this.env.DB.prepare(
      "SELECT value_json FROM signals WHERE symbol=? AND status IN ('menunggu_entry','aktif')",
    )
      .bind(quote.symbol)
      .all<{ value_json: string }>();
    for (const row of results) {
      const signal = JSON.parse(row.value_json) as Signal,
        next = advanceSignal(signal, quote.price, quote.at);
      if (JSON.stringify(next) !== JSON.stringify(signal))
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE signals SET status=?,value_json=? WHERE id=?",
          ).bind(next.status, JSON.stringify(next), next.id),
          this.env.DB.prepare(
            "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) VALUES(?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            next.id,
            next.status,
            quote.price,
            quote.at,
            JSON.stringify({
              hitTargets: next.hitTargets,
              entryTouchedAt: next.entryTouchedAt || null,
            }),
          ),
        ]);
    }
    if (!previous || previous.status === "stale") return;
    const config = await settings(this.env),
      alerts = await this.env.DB.prepare(
        "SELECT id,price,last_sent_at FROM alerts WHERE symbol=? AND enabled=1 AND fired=0",
      )
        .bind(quote.symbol)
        .all<{ id: string; price: number; last_sent_at: number | null }>();
    for (const alert of alerts.results)
      if (
        Math.min(previous.price, quote.price) <= alert.price &&
        Math.max(previous.price, quote.price) >= alert.price &&
        quote.at - (alert.last_sent_at || 0) >= config.settings.cooldown * 1000
      ) {
        await this.env.DB.prepare(
          "UPDATE alerts SET fired=1,last_sent_at=? WHERE id=?",
        )
          .bind(quote.at, alert.id)
          .run();
        if (config.settings.discordPrices)
          await enqueue(
            this.env,
            `price-${alert.id}`,
            `${quote.symbol}: harga melintasi ${alert.price}. Sumber ${quote.source}. Bukan nasihat keuangan.`,
          );
      }
  }
  private async expireSignals() {
    const now = Date.now(),
      rows = await this.env.DB.prepare(
        "SELECT value_json FROM signals WHERE status IN ('menunggu_entry','aktif')",
      ).all<{ value_json: string }>();
    for (const row of rows.results) {
      const signal = JSON.parse(row.value_json) as Signal;
      if (signal.expiresAt !== null && signal.expiresAt <= now) {
        signal.status = "kedaluwarsa";
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE signals SET status=?,value_json=? WHERE id=?",
          ).bind(signal.status, JSON.stringify(signal), signal.id),
          this.env.DB.prepare(
            "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) VALUES(?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            signal.id,
            "kedaluwarsa",
            null,
            now,
            "{}",
          ),
        ]);
      }
    }
  }
  private async round() {
    if (this.env.APP_MODE !== "live") return;
    await initialBackfill(this.env);
    if (!(await this.state.storage.getAlarm()))
      await this.state.storage.setAlarm(Date.now() + 1000);
    const { settings: config, version } = await settings(this.env),
      participants = await slots(this.env),
      at = Math.floor(Date.now() / 300000) * 300000;
    const derivativesBySymbol = {
      BTCUSDT: await derivatives(this.env, "BTCUSDT"),
      XAUUSD: await derivatives(this.env, "XAUUSD"),
    };
    for (const symbol of symbols)
      for (const tf of timeframes) {
        try {
          if (
            await this.env.DB.prepare(
              "SELECT id FROM meetings WHERE symbol=? AND tf=? AND at=?",
            )
              .bind(symbol, tf, at)
              .first()
          )
            continue;
          const data = await marketCandles(this.env, symbol, tf);
          await persistCandles(this.env, symbol, tf, data);
          const scanner = scan(
              data.candles,
              derivativesBySymbol[symbol],
              config,
            ),
            id = crypto.randomUUID(),
            meeting: Meeting = {
              id,
              symbol,
              tf,
              at,
              phase: "scanner",
              scanner,
              votes: [],
              reason: "Scanner dievaluasi pada candle close.",
            };
          await this.saveMeeting(meeting);

          const candidates = scannerCandidates(scanner, config),
            winner = candidates.join("|"),
            last = data.candles.at(-1) as Candle;
          if (!candidates.length) {
            meeting.phase = "rejected";
            meeting.reason = "Tidak ada konsensus scanner; AI tidak dipanggil.";
            await this.saveMeeting(meeting);
            continue;
          }
          const claim = await this.env.DB.prepare(
            "INSERT OR IGNORE INTO meeting_dedup(symbol,tf,candle_time,direction) VALUES(?,?,?,?)",
          )
            .bind(symbol, tf, last.time, winner)
            .run();
          if (!claim.meta.changes) {
            meeting.phase = "rejected";
            meeting.reason =
              "Kandidat yang sama telah dianalisis pada candle ini (dedup).";
            await this.saveMeeting(meeting);
            continue;
          }
          meeting.phase = "ai";
          await this.saveMeeting(meeting);

          meeting.votes = await Promise.all(
            participants.map((slot) =>
              callSlot(this.env, slot, {
                symbol,
                tf,
                scanner,
                candles: data.candles,
                source: data.source,
                language: config.language,
              }),
            ),
          );
          meeting.phase = "rr";
          await this.saveMeeting(meeting);

          const decision = decide(meeting.votes, scanner, config),
            signal = makeSignal(
              symbol,
              tf,
              meeting.votes,
              scanner,
              config,
              data.source,
              Date.now(),
            );
          if (signal) {
            signal.settingsVersion = version;
            await this.env.DB.prepare(
              "INSERT INTO signals(id,symbol,tf,status,created_at,value_json) VALUES(?,?,?,?,?,?)",
            )
              .bind(
                signal.id,
                symbol,
                tf,
                signal.status,
                signal.createdAt,
                JSON.stringify(signal),
              )
              .run();
            meeting.signalId = signal.id;
            meeting.phase = "approved";
            meeting.reason = decision.reason;
            if (config.discordSignals)
              await enqueue(
                this.env,
                `signal-${signal.id}`,
                `${symbol} ${tf} ${signal.direction.toUpperCase()}\nEntry ${signal.levels.entry.join(" – ")} | SL ${signal.levels.sl}\n${signal.levels.tp.map((p, i) => `TP${i + 1} ${p}`).join(" | ")}\nRR TP1 1:${signal.rr.toFixed(2)} · ${data.source}\n${decision.reason}\nBukan nasihat keuangan. Tidak ada eksekusi order.`,
              );
          } else {
            meeting.phase = "rejected";
            meeting.reason =
              decision.approved && config.ttl[tf] === null
                ? "Level/RR valid, tetapi masa berlaku timeframe belum dikonfigurasi. Sinyal tidak diterbitkan."
                : decision.reason;
          }
          await this.saveMeeting(meeting);
        } catch {
          await this.env.DB.prepare(
            "INSERT INTO service_log(id,kind,message,at) VALUES(?,?,?,?)",
          )
            .bind(
              crypto.randomUUID(),
              "scanner_error",
              `Sumber data atau konfigurasi belum tersedia untuk ${symbol} ${tf}.`,
              Date.now(),
            )
            .run();
        }
      }
    await flushOutbox(this.env);
  }
  private async saveMeeting(m: Meeting) {
    await this.env.DB.prepare(
      "INSERT INTO meetings(id,symbol,tf,at,phase,value_json) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phase=excluded.phase,value_json=excluded.value_json",
    )
      .bind(m.id, m.symbol, m.tf, m.at, m.phase, JSON.stringify(m))
      .run();
    const at = Date.now();
    await this.state.storage.put("current-meeting", { details: m, at });
    await this.broadcast(publicMeetingEvent(m, at), {
      type: "meeting",
      meeting: m,
      at,
    });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") socket.send("pong");
  }
  webSocketClose(socket: WebSocket) {
    socket.close();
  }
}
