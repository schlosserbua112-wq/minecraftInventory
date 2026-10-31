#!/usr/bin/env bash
# Einmalig auf dem Pi ausführen (als normaler Benutzer mit Docker-Rechten):
#   bash setup-autodeploy.sh
# Richtet ein: Lese-Schlüssel für GitHub, Klon des Branches pi-deploy,
# systemd-Timer, der alle 2 Minuten nach einem neuen Bundle schaut.
# Erneut ausführen ist unschädlich. Entfernen: siehe README.md im selben Ordner.
set -euo pipefail

NAME=minecraft-tracker
REPO=schlosserbua112-wq/minecraftInventory
STATE=/opt/apps/.${NAME}-autodeploy
KEY=$HOME/.ssh/${NAME}-deploy
HERE=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$HOME/.ssh" "$STATE"
chmod 700 "$HOME/.ssh"

if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "pi-${NAME}-deploy" -f "$KEY"
fi
if ! grep -q "Host github-${NAME}" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<CFG

Host github-${NAME}
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
CFG
  chmod 600 "$HOME/.ssh/config"
fi
ssh-keygen -F github.com >/dev/null 2>&1 || ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null

until git ls-remote "git@github-${NAME}:${REPO}.git" pi-deploy >/dev/null 2>&1; do
  echo
  echo "=== Einmalig: diesen Schlüssel in GitHub eintragen ==="
  echo "https://github.com/${REPO}/settings/keys/new"
  echo "Titel: Pi Auto-Deploy   |   'Allow write access' NICHT anhaken"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Eingetragen? Enter drücken (Strg+C bricht ab) ... " _
done

if [ ! -d "$STATE/repo/.git" ]; then
  git clone --quiet --branch pi-deploy --single-branch "git@github-${NAME}:${REPO}.git" "$STATE/repo"
fi
install -m 755 "$HERE/pi-autodeploy.sh" "$STATE/pi-autodeploy.sh"

sudo tee /etc/systemd/system/${NAME}-autodeploy.service >/dev/null <<UNIT
[Unit]
Description=Minecraft-Tracker: neues Bundle von GitHub einspielen
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$USER
Environment=HOME=$HOME
ExecStart=$STATE/pi-autodeploy.sh
Nice=10
UNIT

sudo tee /etc/systemd/system/${NAME}-autodeploy.timer >/dev/null <<UNIT
[Unit]
Description=Minecraft-Tracker: alle 2 Minuten nach neuem Bundle schauen

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
RandomizedDelaySec=15s

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now ${NAME}-autodeploy.timer
echo "Ersten Durchlauf starten ..."
sudo systemctl start ${NAME}-autodeploy.service || true
tail -n 3 "$STATE/history.log" 2>/dev/null || true
echo "Fertig. Status: systemctl status ${NAME}-autodeploy.timer   Log: journalctl -u ${NAME}-autodeploy -n 30"
