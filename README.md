# Minecraft-Ressourcen-Tracker

Zeigt fast live, welche Ressourcen jeder Spieler auf unserer Vanilla-Welt hat, was Allgemeingut ist und was für welches Projekt gesammelt wurde. Ein Raspberry Pi sammelt die Daten, Supabase speichert sie, die Website auf Vercel zeigt sie an.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `packages/core` | Gemeinsame Logik: Namensregeln, Zählen inkl. Shulkerboxen, Region-Berechnung, Materiallisten-Parser, Mock-Welt. Mit Tests. |
| `apps/collector` | Sammler für den Pi. `MODE=mock` schreibt Beispieldaten, `MODE=live` (RCON + FTP) folgt, sobald der Server erreichbar ist. |
| `apps/web` | Website (Next.js). Ohne Supabase-Zugang läuft sie im Demo-Modus mit Beispieldaten. |
| `supabase/` | Datenbankschema mit Zugriffsregeln und Beispiel-Seed. |
| `deploy/pi/minecraft-tracker` | Docker-Compose für den Pi: eigener Container auf Port 8101, eigene Kachel im pi-dashboard. |
| `.claude/skills/impeccable` | Design-Skill (Apache 2.0, von pbakaus/impeccable). |

## Namensregeln für Kisten

Name im Amboss: Spielername → Besitz des Spielers, `Allgemein` → Allgemeingut, `Projekt <Name>` → Projekt. Unbenannte Kisten werden ignoriert, alles andere landet unter „Nicht zugeordnet“. Groß- und Kleinschreibung ist egal.

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

## Auf den Pi bringen

```powershell
npm install
npm run pi:bundle   # erzeugt dist\pi\minecraft-tracker (Sammler als eine Datei + Compose)
..\pi-dashboard\scripts\deploy.ps1 -Path .\dist\pi\minecraft-tracker
```

Das legt nur `/opt/apps/minecraft-tracker` an. pi-dashboard, LAN-Party und Autodarts bleiben unverändert; die Kachel entsteht über die `dashboard.*`-Labels.

Die Kachel (Port 8101) öffnet die Einstellungsseite des Sammlers: Datenquellen ein- und ausschalten, Abfrage-, Zonen-, Vollscan- und Verlaufsintervall, Pause. Die Werte liegen im Docker-Volume `settings` und gelten sofort, ohne Neustart. Zugangsdaten stehen dort bewusst nicht, die bleiben in `/etc/minecraft-tracker.env`.
Entfernen: `cd /opt/apps/minecraft-tracker && docker compose down --rmi all && cd .. && sudo rm -rf minecraft-tracker`.

Hinweis: Auf dem Pi ist die Speicher-Cgroup abgeschaltet (`cgroup_disable=memory`), deshalb greift `mem_limit` nicht. Der Sammler begrenzt seinen Heap selbst und braucht im Leerlauf etwa 63 MB.

## Noch offen (braucht den Server)

- RCON-Ausgaben und NBT-Format von Minecraft 26.3 an echten Dateien prüfen
- `MODE=live`: Online-Spieler per RCON, Offline-Spieler aus `playerdata`, Kisten aus Region-Dateien der Zonen
