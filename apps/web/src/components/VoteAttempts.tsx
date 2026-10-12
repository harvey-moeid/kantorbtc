import type { Vote } from "../../../../packages/shared/src/domain";
import { useStore } from "../store";

export default function VoteAttempts({ vote }: { vote: Vote }) {
  const language = useStore((s) => s.settings.language);
  if (!vote.attempts?.length) return null;
  const labels =
    language === "id"
      ? {
          valid: "valid",
          unavailable: "tidak tersedia",
          timeout: "timeout",
          invalid_output: "output tidak valid",
          provider_error: "provider gagal",
        }
      : {
          valid: "valid",
          unavailable: "unavailable",
          timeout: "timeout",
          invalid_output: "invalid output",
          provider_error: "provider failed",
        };
  return (
    <details className="muted">
      <summary>
        {language === "id" ? "Riwayat provider" : "Provider history"} (
        {vote.attempts.length})
      </summary>
      <ol>
        {vote.attempts.map((attempt, i) => (
          <li key={i}>
            {attempt.provider} · {attempt.model} · {labels[attempt.status]} ·{" "}
            {attempt.latency} ms
          </li>
        ))}
      </ol>
    </details>
  );
}
