# Minecraft-Ressourcen-Tracker

Zeigt fast live, welche Ressourcen jeder Spieler auf unserer Vanilla-Welt hat, was Allgemeingut ist und was für welches Projekt gesammelt wurde. Ein Raspberry Pi sammelt die Daten, Supabase speichert sie, die Website auf Vercel zeigt sie an.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `packages/core` | Gemeinsame Logik: Namensregeln, Zählen inkl. Shulkerboxen, Region-Berechnung, Materiallisten-Parser, Mock-Welt. Mit Tests. |
| `apps/collector` | Sammler für den Pi. `MODE=mock` schreibt Beispieldaten, `MODE=live` liest den Server per RCON und Dateien (lokal oder FTP, nur lesend). |
| `apps/web` | Website (Next.js). Ohne Supabase-Zugang läuft sie im Demo-Modus mit Beispieldaten. |
| `supabase/` | Datenbankschema mit Zugriffsregeln und Beispiel-Seed. |
| `deploy/pi/minecraft-tracker` | Docker-Compose für den Pi: eigener Container auf Port 8101, eigene Kachel im pi-dashboard. |
| `.claude/skills/impeccable` | Design-Skill (Apache 2.0, von pbakaus/impeccable). |

## Namensregeln für Kisten

Name im Amboss: Spielername → Besitz des Spielers, `Allgemein` → Allgemeingut, `Projekt <Name>` → Projekt. Unbenannte Kisten sind „Nicht zugeordnet“, bis jemand sie in der Suche zuordnet; alles andere landet unter „Nicht zugeordnet“. Groß- und Kleinschreibung ist egal.

Unbenannte Kisten: Unbenannte Kisten mit Inhalt aus den Zonen erscheinen in der Suche auf der Karte. Jeder kann eine anklicken und „Meine“ oder „Allgemeinheit“ wählen (zählt dann wie eine Kiste „Allgemein“); die Zuordnung hängt an der Position und übersteht neue Scans. Ungeöffnete Loot-Kisten tauchen nie auf, schon geöffnete lassen sich nicht von selbst gebauten unterscheiden. Solche Kisten blendet man mit „Keine Spielerkiste, ausblenden“ dauerhaft aus (wieder einblenden in der Suche unter dem Filter „Ausgeblendet“).

Private Kiste: Unter „Meine Kisten“ macht jeder per Schalter an der Kiste höchstens eine seiner Kisten privat. Andere Spieler sehen sie und ihren Inhalt dann nirgends mehr (Suche, Karte, Projekte), nur Admins; das prüft die Datenbank per RLS. Gehört die Kiste nicht mehr dem Spieler (umbenannt oder „Nicht meine“), ist sie wieder für alle sichtbar.

Meine Kisten: Der Tab zeigt jedem seine Kisten mit Inhalt; dort lassen sie sich umbenennen und privat machen. Inventar, Enderkiste und andere Spieler stehen in der Suche unter „Nach Spieler“ (bei genau einem Spieler aufgeteilt nach Inventar, Enderkiste und Kisten). Die alten Adressen `/meine-items`, `/inventare` und `/spieler` leiten weiter. Eigene Kisten umbenennen: Der neue Name gilt nur auf der Website (Tabelle `container_labels`, Migration `20261031000100_container_labels.sql`); im Spiel und für die Zuordnung zählt weiter der Amboss-Name.

Crafting-Rechner: Der Tab `/crafting` löst ein Endprodukt (alle Items mit Werkbank-Rezept) Stufe für Stufe bis zu den Grundstoffen auf und zeigt den Ablauf als Fluss von links nach rechts. Gleiche Zwischenprodukte aus mehreren Zweigen werden erst zusammengezählt und dann auf ganze Crafts aufgerundet; Überschuss steht als „übrig“ dabei. Wo jedes Holz geht, gilt die gewählte Holzsorte; andere Auswahlen (Kohle/Holzkohle) und alternative Rezepte lassen sich an der Karte umstellen, ebenso „nicht craften“. Grundstoffe sind Items ohne Rezept und bei Hin-und-zurück-Rezepten (Barren ↔ Block ↔ Nugget) die meistbenutzte Seite. Steinsäge-Rezepte nur per Schalter (in `recipes-data.ts` mit `1` markiert). „Mit meinem Bestand“ nimmt eigene Kisten und Inventar (optional Allgemeingut) zuerst. Logik: `packages/core/src/crafting.ts`.

Biome auf der Karte: Beim Zeichnen der Weltkarte liest der Sammler aus den Region-Dateien das Biom an der Oberfläche (je 4 × 4 Blöcke), glättet es, schlägt Flüsse und Strände dem Nachbarbiom zu und legt Grenzlinien und ein Namensschild je Fläche (englische Namen wie im Spiel) als `overworld/biomes.json` in den Bucket „map“. Auf der Website schaltet der Knopf „Biome einblenden“ die Ebene an und aus; Schilder erscheinen nur für Flächen, die beim aktuellen Zoom groß genug sind.

## Entnahmen aus fremden Kisten

Vanilla merkt sich nicht, wer eine Kiste geöffnet hat. Der Sammler vergleicht deshalb jede Abfrage mit der vorherigen: Fehlt in einer Spielerkiste in einer Zone etwas, schaut er, welcher andere Online-Spieler in der Nähe war (Position per RCON) und genau dieses Item dazubekommen hat. Stufen: „sicher“ (an der Kiste und Item bekommen), „wahrscheinlich“ (Item bekommen, in Reichweite), „möglich“ (an der Kiste, Item aber nicht im Inventar). Entnahmen durch den Besitzer selbst und ohne fremden Spieler in der Nähe (Trichter) werden nicht gemeldet. Die Website zeigt sie unter „Entnahmen“, jeder sieht seine Kisten, Admins alle. Auf der Pi-Kachel abschaltbar.

## Lokal starten

```bash
npm install
npm test            # Kernlogik
npm run dev:web     # Website im Demo-Modus auf http://localhost:3000
npm run mock        # Mock-Sammler (ohne .env nur Konsole)
```

## Supabase einrichten

1. Projekt anlegen, `supabase/migrations/*.sql` und optional `supabase/seed.sql` ausführen.
2. Ersten Admin anlegen (SQL-Editor): `select private.bootstrap_admin('Valentin', '<Passwort>');`
3. Weitere Benutzer legt der Admin auf der Website unter „Benutzer“ an. Login mit Name und Passwort; beim ersten Login wählt jeder ein eigenes Passwort, ändern geht später unter „Konto“.
4. Website (Vercel): URL und öffentlicher Key stehen in `apps/web/.env.production`.
5. Pi: `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` in `/etc/minecraft-tracker.env` (Rechte 600). Der Schreib-Key bleibt nur auf dem Pi.

## Original-Item-Icons

Die Texturen gehören Mojang und liegen deshalb nicht im Repo. `node scripts/item-icons.mjs` liest sie aus dem eigenen Minecraft-Client (neueste Jar unter `%APPDATA%\.minecraft\versions`, oder Pfad als Argument) und lädt sie nach einer Admin-Anmeldung als `icons.json` in den privaten Bucket `items` (Migration `20261030000800_item_icons_bucket.sql`). Nur angemeldete Freunde können sie laden. Das Skript nimmt auch die deutschen Item-Namen aus dem Sprachpaket des Launchers mit (`assets/indexes` und `assets/objects` neben `versions`). Ohne Datei zeigt die Website die farbigen Ersatzsymbole. Mit `--nur-datei` entsteht nur `item-icons.json`; nach `apps/web/public/` kopiert, nutzt sie auch der Demo-Modus.

## Auf den Pi bringen

Automatisch: Nach jedem Merge auf `main`, der den Sammler betrifft, baut GitHub Actions das Bundle (`.github/workflows/pi-bundle.yml`) und legt es auf den Branch `pi-deploy`. Der Pi schaut alle 2 Minuten nach und spielt ein neues Bundle selbst ein. Einrichtung einmalig, siehe `deploy/pi/autodeploy/README.md`.

Von Hand (geht weiterhin):

```powershell
npm install
npm run pi:bundle   # erzeugt dist\pi\minecraft-tracker (Sammler als eine Datei + Compose)
..\pi-dashboard\scripts\deploy.ps1 -Path .\dist\pi\minecraft-tracker
```

Das legt nur `/opt/apps/minecraft-tracker` an. pi-dashboard, LAN-Party und Autodarts bleiben unverändert; die Kachel entsteht über die `dashboard.*`-Labels.

Die Kachel (Port 8101) öffnet die Einstellungsseite des Sammlers: Datenquellen ein- und ausschalten, Abfrage-, Zonen- und Vollscanintervall, Pause. Die Werte liegen im Docker-Volume `settings` und gelten sofort, ohne Neustart. Zugangsdaten stehen dort bewusst nicht, die bleiben in `/etc/minecraft-tracker.env`.
Entfernen: `cd /opt/apps/minecraft-tracker && docker compose down --rmi all && cd .. && sudo rm -rf minecraft-tracker`.

Hinweis: Auf dem Pi ist die Speicher-Cgroup abgeschaltet (`cgroup_disable=memory`), deshalb greift `mem_limit` nicht. Der Sammler begrenzt seinen Heap selbst und braucht im Leerlauf etwa 63 MB.

## Noch offen (braucht den Server)

- RCON-Ausgaben und NBT-Format von Minecraft 26.3 an echten Dateien prüfen
- `MODE=live`: Online-Spieler per RCON, Offline-Spieler aus `playerdata`, Kisten aus Region-Dateien der Zonen

## Server umschalten (Testserver ↔ G-Portal)

Der Sammler kennt den Minecraft-Server nur aus der .env. Vorlagen liegen in `deploy/server-profiles/`:

- `testserver.env.example`: lokaler Vanilla-Server auf ValePC, Dateien direkt aus dem Server-Ordner. Als `apps/collector/.env.testserver` ablegen, RCON-Passwort eintragen, dann `npm run live:test`.
- `gportal.env.example`: echter Server, Dateien per FTP. Den Block in `/etc/minecraft-tracker.env` auf dem Pi einfügen, Werte aus dem G-Portal-Panel eintragen, `docker compose up -d` in `/opt/apps/minecraft-tracker`.

Am Code ändert sich beim Umschalten nichts. Fehlen Angaben, meldet der Sammler beim Start genau, welche.
