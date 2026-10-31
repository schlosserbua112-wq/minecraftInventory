import type { OwnerType, StockRow } from "@mc/core";
import { OWNER_COLOR, OWNER_LABEL } from "@/lib/derive";
import { fmt } from "@/lib/items";

const ORDER: OwnerType[] = ["common", "player", "project", "unassigned"];

/** Aufteilung eines Bestands nach Besitzart als Balken mit Legende. */
export function OwnerSplit({ rows }: { rows: StockRow[] }) {
  const sums = ORDER.map((t) => ({ t, n: rows.reduce((s, r) => (r.owner_type === t ? s + r.count : s), 0) })).filter((x) => x.n > 0);
  if (!sums.length) return null;
  const label = sums.map((s) => `${OWNER_LABEL[s.t]} ${fmt.format(s.n)}`).join(", ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="bar" role="img" aria-label={`Aufteilung: ${label}`}>
        {sums.map((s) => (
          <span key={s.t} style={{ flex: s.n, background: OWNER_COLOR[s.t] }} />
        ))}
      </div>
      <div className="row" style={{ gap: "6px 16px", fontSize: 12, color: "var(--muted)" }}>
        {sums.map((s) => (
          <span key={s.t} className="badge">
            <span className="dot" style={{ background: OWNER_COLOR[s.t] }} />
            {OWNER_LABEL[s.t]} <span className="num">{fmt.format(s.n)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
