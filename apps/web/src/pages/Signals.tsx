import { useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { symbols } from "../../../../packages/shared/src/domain";
import { useT } from "../i18n";
import { PageTitle, statusLabels } from "../components/UI";
import { SignalRows } from "../components/SignalRows";
export default function Signals() {
  const [symbol, setSymbol] = useState("all"),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    t = useT();
  return (
    <>
      <PageTitle
        eyebrow="SIGNAL DESK"
        title={t.signals}
        description="Dari konsensus scanner sampai hasil entry, TP, dan SL."
      />
      <div className="info-strip">
        <ShieldCheck size={17} />
        <span>
          Persetujuan bos otomatis · RR minimum pada TP1 · satu SL · tanpa
          eksekusi order
        </span>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs">
            {["all", ...symbols].map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={s === symbol ? "active" : ""}
              >
                {s === "all" ? t.all : s}
              </button>
            ))}
          </div>
          <div className="filter-tools">
            <div className="search-field">
              <Search size={15} />
              <input
                placeholder="Cari sinyal…"
                aria-label="Cari sinyal"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Semua status</option>
              {Object.entries(statusLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <SignalRows symbol={symbol} status={status} search={search} />
      </section>
    </>
  );
}
