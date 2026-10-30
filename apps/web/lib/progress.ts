import { balanceMaterials } from "@mc/core";
import type { Snapshot } from "./types";

export function projectBalance(s: Snapshot, key: string) {
  const sum = (type: string, k?: string) => {
    const m = new Map<string, number>();
    for (const r of s.stock) if (r.owner_type === type && (k === undefined || r.owner_key === k)) m.set(r.item_id, (m.get(r.item_id) ?? 0) + r.count);
    return m;
  };
  const goals = s.goals.filter((g) => g.project_key === key).map((g) => ({ itemId: g.item_id, count: g.target }));
  return balanceMaterials(goals, sum("project", key), sum("common"));
}

/** Anteil erledigt über alle Ziele (nur Projektkisten zählen als erledigt). */
export function projectPercent(s: Snapshot, key: string) {
  const b = projectBalance(s, key);
  const need = b.reduce((n, x) => n + x.needed, 0);
  const have = b.reduce((n, x) => n + Math.min(x.inProject, x.needed), 0);
  return need ? Math.round((have / need) * 100) : null;
}
