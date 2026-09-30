#!/bin/bash
set -euo pipefail
exec 9>/root/vovremya-deploy.lock
flock -n 9
stage=$(mktemp -d /root/tasks-release.XXXXXX)
backup=/root/tasks-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
tar -xzf /root/tasks-release.tar.gz -C "$stage"
files=(etc/nginx/sites-available/vovremya opt/vovremya/server.py opt/vovremya/push_system.py var/www/vovremya)
if [ -f /opt/vovremya/tasks.py ]; then files+=(opt/vovremya/tasks.py); fi
tar -czf "$backup/files.tar.gz" -C / "${files[@]}"
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
    echo "Deployment failed; previous files restored from $backup" >&2
}
trap rollback ERR
for file in server.py push_system.py tasks.py; do
    install -m 644 "$stage/backend/$file" "/opt/vovremya/$file"
done
install -d -m 755 /var/www/vovremya/tasks
install -m 644 "$stage"/dist/tasks/* /var/www/vovremya/tasks/
install -m 644 "$stage/dist/hub/index.html" "$stage/dist/hub/hub.js" /var/www/vovremya/hub/
install -m 644 "$stage/dist/sw.js" "$stage/dist/push.js" /var/www/vovremya/
install -m 644 "$stage/deploy/nginx-https.conf" /etc/nginx/sites-available/vovremya
nginx -t
systemctl restart vovremya-api
systemctl reload nginx
sleep 2
/opt/vovremya/venv/bin/python "$stage/deploy/verify-tasks.py"
trap - ERR
echo "Published tasks; rollback files: $backup"
