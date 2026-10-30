import type { StockRow } from "@mc/core";
import { totals } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import { ItemIcon } from "./ItemIcon";
import { useItemNames } from "@/lib/itemicons";

/** Summen je Item als Tabelle. */
export function ItemTable({ rows, empty = "Hier liegt noch nichts.", limit }: { rows: StockRow[]; empty?: string; limit?: number }) {
  useItemNames(); // deutsche Namen nachladen
  const list = totals(rows);
  if (!list.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Menge</th>
          </tr>
        </thead>
        <tbody>
          {(limit ? list.slice(0, limit) : list).map((t) => (
            <tr key={t.item_id}>
              <td>
                <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                  <ItemIcon id={t.item_id} size={18} />
                  {itemName(t.item_id)}
                </span>
              </td>
              <td className="r">{fmt.format(t.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
