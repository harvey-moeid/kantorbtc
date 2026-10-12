import { cotContext } from "./cot";
import { goldVolume } from "./gold-volume";
import {
  signalNotification,
  priceNotification,
} from "../../../packages/shared/src/notification-copy";
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
  signalExpired,
} from "../../../packages/shared/src/engine";
import type { Env } from "./env";
import { settings, slots } from "./data";
import { callSlot } from "./ai";
import { marketCandles, marketQuote } from "./market";
import { btcCandlesReady, reconcileCandles } from "./reconciliation";
import { claimPriceAlert, enqueue, flushOutbox } from "./notifications";
import { backfillChunk, initialBackfill } from "./backfill";
import { BtcFeed } from "./btc-feed";
import { GoldFeed } from "./gold-feed";
import { derivatives } from "./derivatives";
import {
  advanceEntryClock,
  type MarketObservation,
} from "../../../packages/shared/src/lifecycle";
import { publishSignal } from "./signal-publication";
import {
  publicMeetingEvent,
  type PublicOfficeEvent,
} from "../../../packages/shared/src/stream";
export class MarketHub {
  private running = false;
  private lastMood: NonNullable<PublicOfficeEvent["mood"]> = "tenang";
  private feed: BtcFeed;
  private tickQueue: Promise<void> = Promise.resolve();
  private gold: GoldFeed;
  private previousQuotes = new Map<Quote["symbol"], Quote>();
  private lastPersist = new Map<Quote["symbol"], number>();
  private feedsInitialized = false;
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.feed = new BtcFeed((quote) => this.queueQuote(quote));
    this.gold = new GoldFeed(env, (quote) => this.queueQuote(quote));
  }
  private queueQuote(quote: Quote) {
    this.tickQueue = this.tickQueue
      .then(() => this.processQuote(quote))
      .catch(() => {});
    this.state.waitUntil(this.tickQueue);
  }
  private async processQuote(quote: Quote) {
    if (
      ![quote.price, quote.at, quote.change].every(Number.isFinite) ||
      quote.price <= 0 ||
      quote.at <= 0 ||
      quote.at > Date.now() + 5000
    )
      return;
    let previous = this.previousQuotes.get(quote.symbol) ?? null;
    if (!previous) {
      const stored = await this.env.DB.prepare(
        "SELECT value_json FROM quotes WHERE symbol=?",
      )
        .bind(quote.symbol)
        .first<{ value_json: string }>();
      previous = stored ? JSON.parse(stored.value_json) : null;
    }
    if (previous && quote.at < previous.at) {
      if (quote.status !== "closed") return;
      quote = { ...previous, status: "closed" };
    }
    if (
      previous &&
      quote.at === previous.at &&
      quote.status === previous.status
    ) {
      if (quote.symbol === "XAUUSD") {
        await this.persistQuote(quote);
        await this.refreshGoldClocks(Date.now(), {
          state:
            quote.status === "closed"
              ? "closed"
              : quote.status === "stale"
                ? "unknown"
                : "open",
          knownUntil:
            quote.status === "closed" ? Date.now() + 30000 : quote.at + 30000,
        });
      }
      return;
    }
    const changedSource = previous && previous.source !== quote.source;
    if (changedSource && previous)
      await this.env.DB.prepare(
        "INSERT INTO source_events(id,symbol,from_source,to_source,reason,at) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          quote.symbol,
          previous.source,
          quote.source,
          "Source fallback/recovery",
          Date.now(),
        )
        .run();
    if (
      changedSource ||
      previous?.status !== quote.status ||
      Date.now() - (this.lastPersist.get(quote.symbol) ?? 0) >= 1000
    ) {
      await this.persistQuote(quote);
      this.lastPersist.set(quote.symbol, Date.now());
    }
    this.previousQuotes.set(quote.symbol, quote);
    if (quote.symbol === "XAUUSD")
      await this.refreshGoldClocks(Date.now(), {
        state:
          quote.status === "closed"
            ? "closed"
            : ["live", "fallback"].includes(quote.status)
              ? "open"
              : "unknown",
        knownUntil:
          quote.status === "closed" ? Date.now() + 30000 : quote.at + 30000,
      });
    if (
      quote.status !== "closed" &&
      quote.status !== "stale" &&
      Date.now() - quote.at <= (quote.symbol === "BTCUSDT" ? 15000 : 30000)
    ) {
      await this.trackSignals(quote, changedSource ? null : previous);
    }
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
      if (!this.feedsInitialized) {
        const row = await this.env.DB.prepare(
          "SELECT value_json FROM quotes WHERE symbol='XAUUSD'",
        ).first<{ value_json: string }>();
        if (
          row &&
          (JSON.parse(row.value_json) as Quote).source === "Twelve Data"
        )
          this.gold.fallbackUsed();
        this.feedsInitialized = true;
      }
      await Promise.all([this.feed.maintain(), this.gold.maintain()]);
      for (const symbol of symbols) {
        if (symbol === "BTCUSDT" && this.feed.latest) continue;
        if (symbol === "XAUUSD" && this.gold.latest) continue;
        try {
          let quote = await marketQuote(this.env, symbol);
          if (
            symbol === "XAUUSD" &&
            quote.source === "OANDA" &&
            !this.gold.acceptPrimary(quote)
          ) {
            quote = await marketQuote(this.env, symbol, { skipOanda: true });
          }
          if (symbol === "XAUUSD" && quote.source === "Twelve Data")
            this.gold.fallbackUsed();
          this.queueQuote(quote);
          await this.tickQueue;
        } catch {
          const row = await this.env.DB.prepare(
            "SELECT value_json FROM quotes WHERE symbol=?",
          )
            .bind(symbol)
            .first<{ value_json: string }>();
          if (row) {
            const quote = JSON.parse(row.value_json) as Quote;
            if (quote.status === "closed") continue;
            quote.status = "stale";
            this.previousQuotes.set(symbol, quote);
            await this.broadcast(
              { type: "mood", mood: this.lastMood },
              { type: "tick", quote },
            );
            await this.env.DB.prepare(
              "UPDATE quotes SET value_json=? WHERE symbol=?",
            )
              .bind(JSON.stringify(quote), symbol)
              .run();
          }
        }
      }
      this.tickQueue = this.tickQueue
        .then(async () => {
          await this.refreshGoldClocks(
            Date.now(),
            await this.goldObservation(Date.now()),
          );
          await this.expireSignals();
        })
        .catch(() => {});
      await this.tickQueue;
      await backfillChunk(this.env);
      await flushOutbox(this.env);
    }
    await this.broadcast({ type: "mood", mood: this.lastMood });
    if (this.state.getWebSockets().length || this.env.APP_MODE === "live")
      await this.state.storage.setAlarm(Date.now() + 15000);
  }
  private async goldObservation(now: number): Promise<MarketObservation> {
    const live = this.gold.latest;
    if (live)
      return {
        state: live.status === "closed" ? "closed" : "open",
        knownUntil: live.status === "closed" ? now + 30000 : live.at + 30000,
      };
    const row = await this.env.DB.prepare(
      "SELECT value_json,updated_at FROM quotes WHERE symbol='XAUUSD'",
    ).first<{ value_json: string; updated_at: number }>();
    if (!row) return { state: "unknown", knownUntil: now };
    const quote = JSON.parse(row.value_json) as Quote;
    const state =
      quote.status === "closed"
        ? "closed"
        : ["live", "fallback"].includes(quote.status) && now - quote.at <= 30000
          ? "open"
          : "unknown";
    return {
      state,
      knownUntil:
        state === "open"
          ? Math.min(row.updated_at, quote.at) + 30000
          : row.updated_at + 30000,
    };
  }

  private async refreshGoldClocks(
    now: number,
    observation: MarketObservation,
  ): Promise<void> {
    const { results } = await this.env.DB.prepare(
      "SELECT value_json FROM signals WHERE symbol='XAUUSD' AND status='menunggu_entry'",
    ).all<{ value_json: string }>();
    for (const row of results) {
      const signal = JSON.parse(row.value_json) as Signal;
      const next = advanceEntryClock(signal, now, observation);
      const changes = [
        this.env.DB.prepare(
          "UPDATE signals SET value_json=? WHERE id=? AND status='menunggu_entry'",
        ).bind(JSON.stringify(next), next.id),
      ];
      if (signal.entryClock?.state !== next.entryClock?.state)
        changes.push(
          this.env.DB.prepare(
            "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) VALUES(?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            next.id,
            "entry_clock",
            null,
            now,
            JSON.stringify({
              from: signal.entryClock?.state ?? "legacy",
              to: next.entryClock?.state,
              remainingMs: next.entryClock?.remainingMs,
              reason: "provider_market_status",
            }),
          ),
        );
      await this.env.DB.batch(changes);
    }
  }

  private async trackSignals(quote: Quote, previous: Quote | null) {
    const { results } = await this.env.DB.prepare(
      "SELECT value_json FROM signals WHERE symbol=? AND status IN ('menunggu_entry','aktif')",
    )
      .bind(quote.symbol)
      .all<{ value_json: string }>();
    for (const row of results) {
      const signal = JSON.parse(row.value_json) as Signal;
      if (quote.at < signal.createdAt) continue;
      const next = advanceSignal(signal, quote.price, quote.at);
      if (JSON.stringify(next) !== JSON.stringify(signal))
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE signals SET status=?,value_json=? WHERE id=? AND status=? AND value_json=?",
          ).bind(
            next.status,
            JSON.stringify(next),
            next.id,
            signal.status,
            row.value_json,
          ),
          this.env.DB.prepare(
            "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM signals WHERE id=? AND value_json=?)",
          ).bind(
            crypto.randomUUID(),
            next.id,
            next.status,
            quote.price,
            quote.at,
            JSON.stringify({
              hitTargets: next.hitTargets,
              entryTouchedAt: next.entryTouchedAt || null,
              exitAt: next.exitAt ?? null,
              exitPrice: next.exitPrice ?? null,
              entryClock: next.entryClock ?? null,
              source: quote.source,
              settingsVersion: signal.settingsVersion,
            }),
            next.id,
            JSON.stringify(next),
          ),
        ]);
    }
    if (
      !previous ||
      previous.status === "stale" ||
      previous.status === "closed"
    )
      return;
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
        if (!(await claimPriceAlert(this.env, alert.id, alert.price, quote.at)))
          continue;
        if (config.settings.discordPrices)
          await enqueue(
            this.env,
            `price-${alert.id}`,
            priceNotification(quote, alert.price, config.settings.language),
          );
      }
  }
  private async expireSignals() {
    const now = Date.now(),
      rows = await this.env.DB.prepare(
        "SELECT value_json FROM signals WHERE status='menunggu_entry'",
      ).all<{ value_json: string }>();
    for (const row of rows.results) {
      const signal = JSON.parse(row.value_json) as Signal;
      if (signalExpired(signal, now)) {
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
            JSON.stringify({
              reason: signal.entryClock
                ? "open_market_time_exhausted"
                : "entry_deadline_elapsed",
              entryClock: signal.entryClock ?? null,
            }),
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
    const cot = await cotContext(this.env);
    const derivativesBySymbol = {
      BTCUSDT: undefined as Awaited<ReturnType<typeof derivatives>>,
      XAUUSD: undefined as Awaited<ReturnType<typeof derivatives>>,
    };
    for (const symbol of symbols) {
      if (symbol === "XAUUSD") {
        const observation = await this.goldObservation(Date.now());
        if (
          observation.state !== "open" ||
          observation.knownUntil <= Date.now()
        )
          continue;
      }
      derivativesBySymbol[symbol] = await derivatives(this.env, symbol);
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
          await reconcileCandles(this.env, symbol, tf, data);
          if (
            symbol === "BTCUSDT" &&
            !btcCandlesReady(
              data.candles,
              tf,
              Date.now(),
              Math.max(config.emaSlow, config.rsiPeriod + 1),
            )
          ) {
            await this.saveMeeting({
              id: crypto.randomUUID(),
              symbol,
              tf,
              at,
              phase: "rejected",
              scanner: [],
              votes: [],
              reason:
                "Candle BTC belum lengkap atau close terbaru belum tersedia; AI tidak dipanggil.",
            });
            continue;
          }
          const volume =
            symbol === "XAUUSD" && !(data.candles.at(-1)?.volume ?? 0)
              ? await goldVolume(tf)
              : undefined;
          const scanner = scan(
              data.candles,
              derivativesBySymbol[symbol],
              config,
              volume
                ? {
                    volumeCandles: volume.candles,
                    volumeSource: volume.source,
                    volumeIsProxy: true,
                  }
                : {
                    volumeSource:
                      symbol === "XAUUSD"
                        ? `${data.source} tick/spot volume`
                        : data.source,
                  },
            ),
            id = crypto.randomUUID(),
            meeting: Meeting = {
              id,
              symbol,
              tf,
              at,
              cot: symbol === "XAUUSD" ? cot : undefined,
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
                cot: meeting.cot,
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
            const publication = this.tickQueue.then(async () => {
              const prepared =
                signal.symbol === "XAUUSD"
                  ? advanceEntryClock(
                      signal,
                      Date.now(),
                      await this.goldObservation(Date.now()),
                    )
                  : signal;
              await publishSignal(
                this.env,
                prepared,
                this.previousQuotes.get(signal.symbol),
              );
            });
            this.tickQueue = publication.catch(() => {});
            await publication;
            meeting.signalId = signal.id;
            meeting.phase = "approved";
            meeting.reason = decision.reason;
            if (config.discordSignals)
              await enqueue(
                this.env,
                `signal-${signal.id}`,
                signalNotification(signal, config.language),
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
