import { useState } from "react";
import { Zap } from "lucide-react";
import type { Signal } from "../../../../packages/shared/src/domain";
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
  const signals = useStore((s) => s.signals).filter(
      (s) =>
        (!symbol || symbol === "all" || s.symbol === symbol) &&
        (!status || status === "all" || s.status === status) &&
        `${s.id} ${s.symbol} ${s.tf}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    [selected, setSelected] = useState<Signal | null>(null),
    t = useT();
  return (
    <>
      {signals.length ? (
        <div className="signal-table-wrap">
          <table className="signal-table">
            <thead>
              <tr>
                <th>Aset / TF</th>
                <th>Arah</th>
                {!compact && <th>Entry / SL</th>}
                <th>RR</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {signals.slice(0, compact ? 2 : undefined).map((s) => (
                <SignalRow
                  key={s.id}
                  signal={s}
                  compact={compact}
                  onClick={() => setSelected(s)}
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
          onClose={() => setSelected(null)}
        >
          <SignalDetail signal={selected} />
        </Modal>
      )}
    </>
  );
}
