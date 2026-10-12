import { useState } from "react";
import { Zap } from "lucide-react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { Modal, SignalDetail, SignalRow } from "./UI";
export function SignalRows({
  compact = false,
  symbol,
  status,
  search = "",
}: {
  compact?: boolean;
  symbol?: string;
  status?: string;
  search?: string;
}) {
  const allSignals = useStore((s) => s.signals),
    signals = allSignals.filter(
      (s) =>
        (!symbol || symbol === "all" || s.symbol === symbol) &&
        (!status || status === "all" || s.status === status) &&
        `${s.id} ${s.symbol} ${s.tf}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    [selectedId, setSelectedId] = useState<string | null>(null),
    selected = allSignals.find((signal) => signal.id === selectedId),
    t = useT();
  return (
    <>
      {signals.length ? (
        <div className="signal-table-wrap">
          <table className="signal-table" role="table" aria-label={t.signals}>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader">Aset / TF</th>
                <th role="columnheader">Arah</th>
                {!compact && <th role="columnheader">Entry / SL</th>}
                <th role="columnheader">RR</th>
                <th role="columnheader">Status</th>
                <th role="columnheader" aria-label={t.selected} />
              </tr>
            </thead>
            <tbody role="rowgroup">
              {signals.slice(0, compact ? 2 : undefined).map((s) => (
                <SignalRow
                  key={s.id}
                  signal={s}
                  compact={compact}
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <Zap size={24} />
          <p>{t.noSignals}</p>
        </div>
      )}
      {selected && (
        <Modal
          title={`${selected.symbol} · ${selected.tf}`}
          onClose={() => setSelectedId(null)}
        >
          <SignalDetail signal={selected} />
        </Modal>
      )}
    </>
  );
}
