import { useEffect, useRef, useState } from "react";
import type { Signal } from "../../../../packages/shared/src/domain";
import { api, useStore } from "../store";
import { dateTime, price } from "../i18n";
type Event = {
  id: string;
  kind: string;
  price: number | null;
  at: number;
  details: Record<string, unknown>;
};
type Page = { events: Event[]; nextCursor: { at: number; id: string } | null };
export default function SignalAudit({ signal }: { signal: Signal }) {
  const demo = useStore((s) => s.demo),
    language = useStore((s) => s.settings.language);
  const [events, setEvents] = useState<Event[]>([]),
    [cursor, setCursor] = useState<Page["nextCursor"]>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    paged = useRef(false);
  useEffect(() => {
    generation.current++;
    paged.current = false;
    setBusy(false);
    setEvents([]);
    setCursor(null);
    setError("");
    if (demo) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api<Page>(`/signals/${encodeURIComponent(signal.id)}/events`)
        .then((page) => {
          if (
            alive &&
            useStore.getState().authenticated &&
            !useStore.getState().demo
          ) {
            setEvents((old) =>
              paged.current
                ? [
                    ...new Map(
                      [...page.events, ...old].map((event) => [
                        event.id,
                        event,
                      ]),
                    ).values(),
                  ].sort(
                    (a, b) =>
                      b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
                  )
                : page.events,
            );
            if (!paged.current) setCursor(page.nextCursor);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [signal.id, signal.status, signal.entryClock?.state, demo]);
  const labels: Record<string, string> =
    language === "id"
      ? {
          menunggu_entry: "Menunggu entry",
          aktif: "Entry teramati",
          target_tercapai: "TP1 tercapai",
          stop_loss: "SL teramati",
          dibatalkan: "Dibatalkan",
          kedaluwarsa: "Durasi menunggu entry habis",
          entry_clock: "Jam durasi diperbarui",
          ambigu: "TP/SL ambigu: urutan tick tidak diketahui",
        }
      : {
          menunggu_entry: "Waiting for entry",
          aktif: "Entry observed",
          target_tercapai: "TP1 reached",
          stop_loss: "SL observed",
          dibatalkan: "Cancelled",
          kedaluwarsa: "Entry duration exhausted",
          entry_clock: "Entry clock updated",
          ambigu: "Ambiguous TP/SL: tick order unknown",
        };
  const states: Record<string, string> =
    language === "id"
      ? {
          open: "buka",
          closed: "tutup",
          unknown: "tidak diketahui",
          legacy: "aturan lama",
        }
      : {
          open: "open",
          closed: "closed",
          unknown: "unknown",
          legacy: "legacy",
        };
  return (
    <section className="signal-audit">
      <h3>
        {language === "id" ? "Riwayat status sinyal" : "Signal status history"}
      </h3>
      {demo ? (
        <p className="muted">
          {language === "id"
            ? "Demo tidak memiliki audit backend. Waktu entry pada detail adalah data contoh."
            : "Demo has no backend audit. Entry times shown in the details are sample data."}
        </p>
      ) : (
        <>
          {error && (
            <p className="callout" role="alert">
              {error}
            </p>
          )}
          {events.some((event) => event.kind === "ambigu") && (
            <p className="callout" role="status">
              {language === "id"
                ? "Ada candle yang menyentuh TP1 dan SL tanpa urutan tick. Hasil ditandai ambigu; tick setelahnya tidak menentukan urutan sentuhan sebelumnya."
                : "A candle touched TP1 and SL without an ordered tick record. The outcome is marked ambiguous; later ticks cannot determine the earlier touch order."}
            </p>
          )}
          {events.length ? (
            <ol>
              {events.map((event) => (
                <li key={event.id}>
                  <b>{labels[event.kind] ?? event.kind}</b> ·{" "}
                  {dateTime(event.at)} WIB{" "}
                  {event.price !== null ? `· ${price(event.price)}` : ""}
                  {event.kind === "entry_clock" && (
                    <small>
                      {" "}
                      · {states[String(event.details.from)] ?? "—"} →{" "}
                      {states[String(event.details.to)] ?? "—"} ·{" "}
                      {Math.ceil(Number(event.details.remainingMs) / 60000)}{" "}
                      {language === "id"
                        ? "menit tersisa"
                        : "minutes remaining"}
                    </small>
                  )}
                  {event.kind === "dibatalkan" && (
                    <small>
                      {" "}
                      · {String(event.details.cancelledBySignalId ?? "")}
                    </small>
                  )}
                  {event.kind === "ambigu" && (
                    <small>
                      {" "}
                      · {dateTime(Number(event.details.candleTime) * 1000)} WIB
                      · {String(event.details.source ?? "")}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            !error && (
              <p className="muted">
                {language === "id"
                  ? "Belum ada peristiwa tercatat."
                  : "No recorded events yet."}
              </p>
            )
          )}
          {cursor && (
            <button
              className="button small ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const id = signal.id,
                  requestGeneration = generation.current;
                try {
                  const page = await api<Page>(
                    `/signals/${encodeURIComponent(id)}/events?cursorAt=${cursor.at}&cursorId=${encodeURIComponent(cursor.id)}`,
                  );
                  // Do not restore private data after logout or after entering demo.
                  if (
                    generation.current !== requestGeneration ||
                    !useStore.getState().authenticated ||
                    useStore.getState().demo
                  )
                    return;
                  paged.current = true;
                  setEvents((old) => [
                    ...new Map(
                      [...old, ...page.events].map((event) => [
                        event.id,
                        event,
                      ]),
                    ).values(),
                  ]);
                  setCursor(page.nextCursor);
                } catch (e) {
                  if (generation.current === requestGeneration)
                    setError((e as Error).message);
                } finally {
                  if (generation.current === requestGeneration) setBusy(false);
                }
              }}
            >
              {language === "id"
                ? "Muat riwayat lebih lama"
                : "Load earlier history"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
