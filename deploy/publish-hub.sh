#!/bin/bash
set -euo pipefail
stage=$(mktemp -d /root/hub-release.XXXXXX)
backup=/root/hub-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
tar -xzf /root/hub-release.tar.gz -C "$stage"
tar -czf "$backup/files.tar.gz" -C / etc/nginx/sites-available/vovremya opt/vovremya/server.py var/www/vovremya var/www/gym/index.html
/opt/vovremya/venv/bin/python - "$backup" <<'PY'
import sqlite3,sys
with sqlite3.connect('/var/lib/vovremya/app.sqlite3') as source, sqlite3.connect(sys.argv[1]+'/app.sqlite3') as target:
    source.backup(target)
    assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
PY
rollback() {
    tar -xzf "$backup/files.tar.gz" -C /
    systemctl restart vovremya-api
    nginx -t && systemctl reload nginx
    echo "Deployment failed; files restored from $backup" >&2
}
trap rollback ERR
install -m 644 "$stage/backend/server.py" /opt/vovremya/server.py
install -d -m 755 /var/www/vovremya/hub
install -m 644 "$stage"/dist/hub/* /var/www/vovremya/hub/
for file in index.html auth.js push.js manifest.webmanifest; do
    install -m 644 "$stage/dist/$file" "/var/www/vovremya/$file"
done
install -m 644 "$stage/gym-prototype/dist/index.html" /var/www/gym/index.html
install -m 644 "$stage/deploy/nginx-https.conf" /etc/nginx/sites-available/vovremya
nginx -t
systemctl restart vovremya-api
systemctl reload nginx
sleep 2
/opt/vovremya/venv/bin/python "$stage/deploy/verify-hub.py"
trap - ERR
echo "Published; rollback files: $backup"
