# Automatischer Deploy auf den Pi

Ablauf: Merge auf `main` → GitHub Actions baut das Bundle und legt es auf den Branch `pi-deploy` → der Pi holt ihn spätestens nach 2 Minuten ab und macht `docker compose up -d --build` in `/opt/apps/minecraft-tracker`. Das ist genau das, was `deploy.ps1` vom PC aus macht, nur ohne PC. Der Pi braucht nur ausgehend Zugriff auf GitHub, und zwar nur lesend.

## Einmal einrichten (vom PC aus, im Repo-Ordner)

```powershell
git pull
scp -r deploy\pi\autodeploy pi:/tmp/
ssh -t pi "bash /tmp/autodeploy/setup-autodeploy.sh"
```

Das Skript zeigt einen Schlüssel und einen Link. Den Schlüssel unter *Settings → Deploy keys → Add deploy key* einfügen (Titel „Pi Auto-Deploy“, **ohne** Schreibrecht), dann im Terminal Enter drücken. Danach läuft der erste Deploy sofort.

## Nachsehen

```bash
cat /opt/apps/.minecraft-tracker-autodeploy/history.log   # letzte Deploys: Zeit, ok/FEHLER, Quell-Commit
journalctl -u minecraft-tracker-autodeploy -n 30          # Ausgabe des letzten Laufs
```

Einen bestimmten Stand erneut einspielen: `rm /opt/apps/.minecraft-tracker-autodeploy/last-attempt`, beim nächsten Lauf wird neu gebaut.

## Pausieren oder entfernen

```bash
sudo systemctl disable --now minecraft-tracker-autodeploy.timer             # pausieren
sudo rm /etc/systemd/system/minecraft-tracker-autodeploy.{service,timer}    # entfernen
sudo systemctl daemon-reload && rm -rf /opt/apps/.minecraft-tracker-autodeploy
```
Den Deploy-Key danach in GitHub löschen. Der Container selbst läuft unverändert weiter.
