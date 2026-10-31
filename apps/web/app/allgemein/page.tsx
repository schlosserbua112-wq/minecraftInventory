"use client";

import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { MapView, containerPins } from "@/components/MapView";
import { useData } from "@/lib/data";
import { fmt } from "@/lib/items";

export default function CommonPage() {
  const { snapshot } = useData();
  if (!snapshot) return <div className="page"><Loading /></div>;
  const rows = snapshot.stock.filter((r) => r.owner_type === "common");
  const chests = snapshot.containers.filter((c) => c.owner_type === "common");

  return (
    <main className="split">
      <section className="side" aria-label="Allgemeingut">
        <div>
          <h1>Allgemein</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            <span className="num">{fmt.format(rows.reduce((n, r) => n + r.count, 0))}</span> Items in {chests.length} Kisten mit dem Namen „Allgemein“.
          </p>
        </div>
        <div className="panel">
          <ItemTable rows={rows} empty="Noch keine Kiste heißt „Allgemein“." />
        </div>
      </section>
      <section className="main with-map" aria-label="Karte">
        <MapView pins={containerPins(chests)} zones={snapshot.zones} />
      </section>
    </main>
  );
}
