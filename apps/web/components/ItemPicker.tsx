"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { itemName, matchesItem } from "@/lib/items";
import { ItemIcon } from "./ItemIcon";

/** Suchfeld mit Vorschlägen; Enter oder Klick wählt das Item. */
export function ItemPicker({ options, taken, onPick, placeholder = "Item suchen, z. B. Diamant" }: { options: string[]; taken: string[]; onPick: (id: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const hits = options.filter((id) => !taken.includes(id) && matchesItem(id, q));
    // Treffer am Wortanfang zuerst, dann kürzere Namen
    const query = q.trim().toLowerCase();
    const rank = (id: string) => (itemName(id).toLowerCase().startsWith(query) ? 0 : 1);
    return hits.sort((a, b) => rank(a) - rank(b) || itemName(a).length - itemName(b).length).slice(0, 8);
  }, [options, taken, q]);

  function pick(id: string) {
    onPick(id);
    setQ("");
    setCursor(0);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, matches.length - 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
    else if (e.key === "Enter" && matches[cursor]) pick(matches[cursor]);
    else if (e.key === "Escape") setQ("");
    else return;
    e.preventDefault();
  }

  return (
    <div className="picker" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <label className="search">
        <span className="sr-only">Item hinzufügen</span>
        <input
          value={q}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="picker-list"
          aria-activedescendant={matches[cursor] ? `pick-${cursor}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={key}
        />
      </label>
      {open && q.trim() && (
        <ul className="picker-list" id="picker-list" role="listbox">
          {matches.length === 0 && <li className="faint" style={{ padding: "10px 0" }}>Kein passendes Item.</li>}
          {matches.map((id, i) => (
            <li key={id} id={`pick-${i}`} role="option" aria-selected={i === cursor}>
              <button type="button" className="item-row" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => pick(id)}>
                <ItemIcon id={id} />
                <span className="grow">{itemName(id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
