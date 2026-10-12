import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type LogicalRange,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  seconds,
  type Candle,
  type Signal,
  type Timeframe,
} from "../../../../packages/shared/src/domain";
import {
  ema,
  bollinger,
  rsi,
  macd,
  atr,
} from "../../../../packages/shared/src/engine";
import { structure } from "../../../../packages/shared/src/structure";
import { useStore, type PriceAlert } from "../store";
import { price, useT } from "../i18n";
export default function MarketChart({
  candles,
  indicators,
  signals,
  onPrice,
  alerts = [],
  onAlertEdit,
  timeframe = "H1",
}: {
  candles: Candle[];
  timeframe?: Timeframe;
  indicators: string[];
  signals: Signal[];
  onPrice?: (price: number) => void;
  alerts?: PriceAlert[];
  onAlertEdit?: (id: string, price: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    settings = useStore((s) => s.settings),
    dataRef = useRef(candles),
    priceCallback = useRef(onPrice),
    updateRef = useRef<((candles: Candle[]) => void) | null>(null),
    rangeRef = useRef<LogicalRange | null>(null),
    alertRef = useRef(alerts),
    editCallback = useRef(onAlertEdit),
    updateAlertsRef = useRef<(() => void) | null>(null),
    dragHandlers = useRef<{
      start: (id: string) => void;
      move: (clientY: number) => void;
      finish: (cancel: boolean) => void;
    } | null>(null),
    [handles, setHandles] = useState<
      { id: string; top: number; right: number; price: number }[]
    >([]),
    t = useT();
  dataRef.current = candles;
  priceCallback.current = onPrice;
  alertRef.current = alerts;
  editCallback.current = onAlertEdit;
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#111a21" },
        textColor: "#a3b5c0",
        fontSize: 12,
        fontFamily: "DM Sans",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#27333c" },
        horzLines: { color: "#27333c" },
      },
      crosshair: {
        vertLine: { color: "#b9d7c3" },
        horzLine: { color: "#b9d7c3" },
      },
      rightPriceScale: {
        borderColor: "#34434c",
        scaleMargins: { top: 0.12, bottom: 0.24 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#34434c",
      },
    });
    const updaters: ((data: Candle[]) => void)[] = [],
      addUpdate = (update: (data: Candle[]) => void) => {
        updaters.push(update);
        update(dataRef.current);
      },
      timed = (data: Candle[], values: number[]) =>
        data.map((c, i) => ({
          time: c.time as UTCTimestamp,
          value: values[i],
        }));
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#bdddac",
      downColor: "#e29a88",
      wickUpColor: "#bdddac",
      wickDownColor: "#e29a88",
      borderVisible: false,
    });
    const alertLines = new Map<string, IPriceLine>();
    let drag: { id: string; price: number } | null = null;
    addUpdate((data) =>
      candleSeries.setData(
        data.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
      ),
    );
    const line = (
      calculate: (data: Candle[]) => number[],
      color: string,
      title: string,
      pane = 0,
      priceScaleId?: string,
    ) => {
      const series = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title,
          priceScaleId,
        },
        pane,
      );
      addUpdate((data) => series.setData(timed(data, calculate(data))));
      return series;
    };
    if (indicators.includes("EMA")) {
      line(
        (data) =>
          ema(
            data.map((c) => c.close),
            settings.emaFast,
          ),
        "#e4ba75",
        `EMA ${settings.emaFast}`,
      );
      line(
        (data) =>
          ema(
            data.map((c) => c.close),
            settings.emaSlow,
          ),
        "#879cd0",
        `EMA ${settings.emaSlow}`,
      );
    }
    if (indicators.includes("BB")) {
      line(
        (data) => bollinger(data.map((c) => c.close)).map((b) => b.upper),
        "#6b8791",
        "BB upper",
      );
      line(
        (data) => bollinger(data.map((c) => c.close)).map((b) => b.lower),
        "#6b8791",
        "BB lower",
      );
    }
    if (indicators.includes("Volume")) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volume
        .priceScale()
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      addUpdate((data) =>
        volume.setData(
          data.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "#8ca75f66" : "#a56e5b66",
          })),
        ),
      );
    }
    let pane = 1;
    if (indicators.includes("RSI")) {
      const series = line(
        (data) =>
          rsi(
            data.map((c) => c.close),
            settings.rsiPeriod,
          ),
        "#b9a2cf",
        "RSI",
        pane,
        "rsi",
      );
      chart.panes()[pane++].setHeight(90);
      for (const p of [30, 70])
        series.createPriceLine({
          price: p,
          color: "#5b5564",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: String(p),
        });
    }
    if (indicators.includes("MACD")) {
      const histogram = chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: "macd",
          priceLineVisible: false,
          lastValueVisible: false,
        },
        pane,
      );
      addUpdate((data) =>
        histogram.setData(
          macd(data.map((c) => c.close)).histogram.map((value, i) => ({
            time: data[i].time as UTCTimestamp,
            value,
            color: value >= 0 ? "#b6d88588" : "#d0867388",
          })),
        ),
      );
      line(
        (data) => macd(data.map((c) => c.close)).line,
        "#a8bed4",
        "MACD",
        pane,
        "macd",
      );
      line(
        (data) => macd(data.map((c) => c.close)).signal,
        "#e4ba75",
        "Signal",
        pane,
        "macd",
      );
      chart.panes()[pane++].setHeight(90);
    }
    if (indicators.includes("ATR")) {
      line(
        (data) => data.map((_, i) => atr(data.slice(0, i + 1))),
        "#97bca5",
        "ATR",
        pane,
        "atr",
      );
      chart.panes()[pane++].setHeight(80);
    }
    if (indicators.includes("Sinyal"))
      signals
        .filter((s) => ["aktif", "menunggu_entry"].includes(s.status))
        .forEach((s) => {
          candleSeries.createPriceLine({
            price: s.levels.entry[1],
            color: "#e2c78f",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "ENTRY",
          });
          candleSeries.createPriceLine({
            price: s.levels.sl,
            color: "#cd8476",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "SL",
          });
          s.levels.tp.forEach((tp, i) =>
            candleSeries.createPriceLine({
              price: tp,
              color: "#a8c67d",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `TP${i + 1}`,
            }),
          );
        });
    chart.subscribeClick((event) => {
      if (event.point && event.paneIndex === 0) {
        const p = candleSeries.coordinateToPrice(event.point.y);
        if (p !== null) priceCallback.current?.(p);
      }
    });
    const drawZones = () => {
      const canvas = overlay.current;
      if (!canvas || !container.current) return;
      const ratio = window.devicePixelRatio || 1,
        width = container.current.clientWidth,
        height = container.current.clientHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      const paneHeight = chart.panes()[0].getHeight();
      const nextHandles = alertRef.current
        .filter((alert) => alert.enabled && !alert.fired)
        .flatMap((alert) => {
          const level = drag?.id === alert.id ? drag.price : alert.price;
          const y = candleSeries.priceToCoordinate(level);
          return y === null || y < 14 || y > paneHeight - 14
            ? []
            : [
                {
                  id: alert.id,
                  top: y,
                  right: chart.priceScale("right").width() + 8,
                  price: level,
                },
              ];
        });
      setHandles((previous) =>
        previous.length === nextHandles.length &&
        previous.every((handle, index) => {
          const next = nextHandles[index];
          return (
            handle.id === next.id &&
            handle.top === next.top &&
            handle.right === next.right &&
            handle.price === next.price
          );
        })
          ? previous
          : nextHandles,
      );
      const closed = dataRef.current.filter(
        (c) => c.time + seconds[timeframe] <= Date.now() / 1000,
      );
      const smc = indicators.includes("SMC")
        ? structure(closed, settings.swing)
        : null;
      for (const level of smc?.levels ?? []) {
        const y = candleSeries.priceToCoordinate(level.price);
        const x = level.from
          ? chart.timeScale().timeToCoordinate(level.from as UTCTimestamp)
          : 0;
        if (y === null) continue;
        const left = Math.max(0, x ?? 0),
          right = width - chart.priceScale("right").width();
        ctx.strokeStyle = level.type === "CHoCH" ? "#e4ba75" : "#8ca496";
        ctx.setLineDash(level.type === "LIQUIDITY" ? [3, 4] : [7, 3]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#a4b396";
        ctx.font = "10px DM Sans";
        ctx.fillText(level.type, left + 5, y - 5);
      }
      if (smc?.premiumDiscount) {
        const range = smc.premiumDiscount,
          y = candleSeries.priceToCoordinate(range.midpoint);
        if (y !== null) {
          ctx.strokeStyle = "#6b8791";
          ctx.setLineDash([2, 5]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width - chart.priceScale("right").width(), y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#8ca496";
          ctx.fillText("PREMIUM / DISCOUNT 50%", 5, y - 5);
        }
      }
      for (const z of smc?.zones ?? []) {
        const a = candleSeries.priceToCoordinate(z.high),
          b = candleSeries.priceToCoordinate(z.low),
          x = chart.timeScale().timeToCoordinate(z.from as UTCTimestamp);
        if (a === null || b === null || x === null) continue;
        const left = Math.max(0, x),
          widthZone = width - chart.priceScale("right").width() - left;
        if (widthZone <= 0) continue;
        ctx.fillStyle = z.direction === "long" ? "#b6d88515" : "#d0867315";
        ctx.strokeStyle = z.direction === "long" ? "#b6d88555" : "#d0867355";
        ctx.fillRect(left, a, widthZone, b - a);
        ctx.strokeRect(left, a, widthZone, b - a);
        ctx.font = "10px DM Sans";
        ctx.fillStyle = "#a4b396";
        ctx.fillText(z.type, left + 5, a + 13);
      }
    };
    updateAlertsRef.current = () => {
      drag = null;
      for (const line of alertLines.values())
        candleSeries.removePriceLine(line);
      alertLines.clear();
      for (const alert of alertRef.current.filter(
        (a) => a.enabled && !a.fired,
      )) {
        alertLines.set(
          alert.id,
          candleSeries.createPriceLine({
            price: alert.price,
            color: "#e4ba75",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "ALERT",
          }),
        );
      }
      drawZones();
    };
    dragHandlers.current = {
      start: (id) => {
        const alert = alertRef.current.find(
          (a) => a.id === id && a.enabled && !a.fired,
        );
        if (alert) drag = { id, price: alert.price };
      },
      move: (clientY) => {
        if (!drag || !container.current) return;
        const y = Math.max(
          22,
          Math.min(
            chart.panes()[0].getHeight() - 22,
            clientY - container.current.getBoundingClientRect().top,
          ),
        );
        const level = candleSeries.coordinateToPrice(y);
        if (level === null || !Number.isFinite(level) || level <= 0) return;
        const rounded = Math.round(level * 100) / 100;
        if (rounded <= 0) return;
        drag.price = rounded;
        alertLines.get(drag.id)?.applyOptions({ price: drag.price });
        drawZones();
      },
      finish: (cancel) => {
        if (!drag) return;
        const selected = drag;
        drag = null;
        const original = alertRef.current.find((a) => a.id === selected.id);
        if (original)
          alertLines.get(selected.id)?.applyOptions({ price: original.price });
        drawZones();
        if (!cancel && original?.enabled && !original.fired)
          editCallback.current?.(selected.id, selected.price);
      },
    };
    updateRef.current = (data) => {
      for (const update of updaters) update(data);
      drawZones();
    };
    if (rangeRef.current)
      chart.timeScale().setVisibleLogicalRange(rangeRef.current);
    else
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, dataRef.current.length - 100),
        to: dataRef.current.length + 4,
      });
    const observer = new ResizeObserver(drawZones);
    observer.observe(container.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(drawZones);
    chart.subscribeCrosshairMove(drawZones);
    const frame = requestAnimationFrame(drawZones);
    updateAlertsRef.current();
    return () => {
      rangeRef.current = chart.timeScale().getVisibleLogicalRange();
      updateRef.current = null;
      updateAlertsRef.current = null;
      dragHandlers.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      chart.remove();
    };
  }, [
    indicators,
    signals,
    settings.emaFast,
    settings.emaSlow,
    settings.rsiPeriod,
    settings.swing,
    timeframe,
  ]);
  useEffect(() => {
    updateRef.current?.(candles);
  }, [candles]);
  useEffect(() => {
    updateAlertsRef.current?.();
  }, [alerts]);
  return (
    <div className="market-chart-container">
      <div ref={container} className="market-chart" aria-label={t.chartLabel} />
      <canvas className="smc-overlay" ref={overlay} aria-hidden="true" />
      {handles.map((handle) => (
        <button
          key={handle.id}
          className="alert-line-handle"
          data-alert-id={handle.id}
          style={{ top: handle.top, right: handle.right }}
          aria-label={`${t.editAlert} ${price(handle.price)}`}
          title={t.alertDragNote}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragHandlers.current?.start(handle.id);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              dragHandlers.current?.move(event.clientY);
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            dragHandlers.current?.finish(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => dragHandlers.current?.finish(true)}
          onLostPointerCapture={() => dragHandlers.current?.finish(true)}
          onClick={(event) => {
            // Keyboard and assistive activation open the same numeric editor.
            if (event.detail === 0)
              editCallback.current?.(handle.id, handle.price);
          }}
        >
          ↕ {price(handle.price)}
        </button>
      ))}
    </div>
  );
}
