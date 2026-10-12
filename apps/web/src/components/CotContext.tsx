import type { CotContext as Context } from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import { dateTime } from "../i18n";
import { Badge } from "./UI";
export default function CotContext({ context }: { context?: Context }) {
  const id = useStore((s) => s.settings.language) === "id";
  const report = context?.report;
  return (
    <section className="presentation" aria-label="COT">
      <div>
        <b>COT · COMEX Gold · Managed Money</b>
        <Badge>{context?.status.toUpperCase() ?? "UNAVAILABLE"}</Badge>
      </div>
      <p>
        {id
          ? "Konteks mingguan untuk AI; skor dan arah scanner tidak berubah."
          : "Weekly AI context; scanner scores and directions are unchanged."}
      </p>
      {report && (
        <>
          <p>
            {id
              ? "Tanggal posisi (bukan tanggal rilis)"
              : "Position date (not release date)"}
            : <b>{report.reportDate}</b>
          </p>
          <p>
            Long: {report.managedMoney.long.toLocaleString()} · Short:{" "}
            {report.managedMoney.short.toLocaleString()} · Spreading:{" "}
            {report.managedMoney.spreading.toLocaleString()}
          </p>
          <p>
            Net: {report.managedMoney.net.toLocaleString()} ·{" "}
            {id ? "Perubahan mingguan" : "Weekly change"}:{" "}
            {report.netChange?.toLocaleString() ?? "—"} · Open interest:{" "}
            {report.openInterest.toLocaleString()}
          </p>
          <p>
            {id ? "Diambil" : "Fetched"}: {dateTime(report.fetchedAt)} WIB ·{" "}
            <a href={report.source} target="_blank" rel="noreferrer">
              CFTC · Disaggregated Futures Only · 088691
            </a>
          </p>
        </>
      )}
      {context?.checkedAt && (
        <p>
          {id ? "Diperiksa" : "Checked"}: {dateTime(context.checkedAt)} WIB
        </p>
      )}
      {context?.status !== "fresh" && (
        <p className="callout">
          {id
            ? "Data COT tidak tersedia atau kedaluwarsa; posisi tidak digunakan dalam analisis AI."
            : "COT is unavailable or stale; positioning is excluded from AI analysis."}
        </p>
      )}
      {context?.warning && <p className="muted">{context.warning}</p>}
    </section>
  );
}
