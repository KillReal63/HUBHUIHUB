"""Consistent SQLite snapshots, 14 daily copies on the same VPS."""
import datetime
import os
from pathlib import Path
import sqlite3
import shutil
os.umask(0o077)
root=Path(os.environ.get('DATA_DIR','/var/lib/vovremya'))
destination=root/'backups'
destination.mkdir(mode=0o700,exist_ok=True)
if (root/'vapid.pem').exists():
    shutil.copyfile(root/'vapid.pem',destination/'vapid.pem')
    os.chmod(destination/'vapid.pem',0o600)
target=destination/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')+'.sqlite3')
with sqlite3.connect(root/'app.sqlite3') as source, sqlite3.connect(target) as backup:
    source.backup(backup)
    if backup.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise RuntimeError('Backup integrity check failed')
for old in sorted(destination.glob('????-??-??.sqlite3'))[:-14]: old.unlink()
