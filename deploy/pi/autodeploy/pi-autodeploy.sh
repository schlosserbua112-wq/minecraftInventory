#!/usr/bin/env bash
# Läuft per systemd-Timer auf dem Pi. Holt den Branch "pi-deploy" (fertiges Bundle
# aus GitHub Actions) und spielt ihn genauso ein wie pi-dashboard/scripts/deploy.ps1:
# Ordner /opt/apps/minecraft-tracker ersetzen, dann docker compose up -d --build.
# Einstellungen (Volume) und /etc/minecraft-tracker.env bleiben unberührt.
set -euo pipefail

NAME=minecraft-tracker
STATE=/opt/apps/.${NAME}-autodeploy
SRC=$STATE/repo
APP=/opt/apps/$NAME

cd "$SRC"
git fetch --quiet origin pi-deploy
new=$(git rev-parse origin/pi-deploy)
old=$(cat "$STATE/last-attempt" 2>/dev/null || true)
[ "$new" = "$old" ] && exit 0

echo "$new" > "$STATE/last-attempt"
git reset --quiet --hard "$new"
src_commit=$(cat "$SRC/$NAME/SOURCE_COMMIT" 2>/dev/null || echo "?")
echo "Neues Bundle ${new:0:7} (Quelle ${src_commit:0:7}), spiele ein ..."

stage=/tmp/$NAME.stage
rm -rf "$stage"
cp -r "$SRC/$NAME" "$stage"
chmod -R u+rwX,go+rX "$stage"
if [ -d "$APP" ]; then chmod -R u+w "$APP"; rm -rf "$APP"; fi
mv "$stage" "$APP"

cd "$APP"
if docker compose up -d --build 2>&1 | tail -5; then
  result=ok
else
  result=FEHLER
fi
printf '%s %s quelle=%s bundle=%s\n' "$(date -Is)" "$result" "${src_commit:0:7}" "${new:0:7}" | tee -a "$STATE/history.log"
tail -n 50 "$STATE/history.log" > "$STATE/history.tmp" && mv "$STATE/history.tmp" "$STATE/history.log"
[ "$result" = ok ]
