"""Web Push subscriptions and durable, bounded reminder delivery."""
from schedule_logic import schedule_entries
import base64
from contextlib import contextmanager
import datetime as dt
import hashlib
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading
import time
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import webpush, WebPushException

DATA=Path(os.environ.get('DATA_DIR','/var/lib/vovremya'))
ORIGIN=os.environ.get('APP_ORIGIN','https://144.31.166.231')
@contextmanager
def connect():
    connection=sqlite3.connect(DATA/'app.sqlite3',timeout=10)
    try:
        with connection:
            yield connection
    finally:
        connection.close()

def initialize():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,body TEXT NOT NULL,zone TEXT NOT NULL,created REAL NOT NULL,last_test REAL NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS push_deliveries(subscription TEXT NOT NULL,dose TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL,next_try REAL NOT NULL,created REAL NOT NULL,PRIMARY KEY(subscription,dose));
        ''')
    path=DATA/'vapid.pem'
    if not path.exists():
        key=ec.generate_private_key(ec.SECP256R1())
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f:
            f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))

def public_key():
    key=serialization.load_pem_private_key((DATA/'vapid.pem').read_bytes(),password=None)
    return base64.urlsafe_b64encode(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)).rstrip(b'=').decode()

def validate_subscription(sub):
    if not isinstance(sub,dict): raise ValueError('Invalid subscription')
    endpoint=sub.get('endpoint','')
    if not isinstance(endpoint,str) or len(endpoint)>4096: raise ValueError('Invalid endpoint')
    url=urlsplit(endpoint)
    host=url.hostname or ''
    if url.scheme!='https' or url.port not in (None,443) or url.username or url.password or url.fragment:
        raise ValueError('Invalid endpoint')
    if not (host=='web.push.apple.com' or host.endswith('.push.apple.com') or host=='fcm.googleapis.com' or host=='updates.push.services.mozilla.com' or host.endswith('.push.services.mozilla.com')):
        raise ValueError('Unsupported push provider')
    keys=sub.get('keys',{})
    for field,size in [('auth',16),('p256dh',65)]:
        value=keys.get(field,'')
        if not isinstance(value,str) or len(value)>200: raise ValueError('Invalid push key')
        decoded=base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True)
        if len(decoded)!=size: raise ValueError('Invalid push key')
        if field=='p256dh': ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),decoded)
    return {'endpoint':endpoint,'keys':{'auth':keys['auth'],'p256dh':keys['p256dh']}}

def identity(endpoint):return hashlib.sha256(endpoint.encode()).hexdigest()

def dispatch(sub,payload,ttl=300):
    try:
        webpush(subscription_info=sub,data=json.dumps(payload,ensure_ascii=False),vapid_private_key=str(DATA/'vapid.pem'),vapid_claims={'sub':ORIGIN},ttl=ttl,timeout=10,headers={'Urgency':'high'})
        return 'sent'
    except WebPushException as error:
        code=error.response.status_code if error.response is not None else 0
        if code in (404,410):return 'expired'
        return 'retry' if code in (0,408,429) or code>=500 else 'failed'
    except Exception:
        return 'retry'

def api(c,path,body):
    endpoint=body.get('endpoint')
    if path=='/api/push/subscribe':
        sub=validate_subscription(body.get('subscription'))
        zone=body.get('timezone')
        if not isinstance(zone,str) or len(zone)>80: raise ValueError('Invalid timezone')
        try: ZoneInfo(zone)
        except Exception: raise ValueError('Invalid timezone')
        sid=identity(sub['endpoint'])
        if c.execute('SELECT count(*) FROM push_subscriptions').fetchone()[0]>=20 and not c.execute('SELECT 1 FROM push_subscriptions WHERE id=?',(sid,)).fetchone():
            return 400,{'error':'Достигнут предел: 20 устройств'}
        c.execute('INSERT INTO push_subscriptions(id,body,zone,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,zone=excluded.zone',(sid,json.dumps(sub),zone,time.time()))
        c.commit()
        return 200,{'ok':True,'timezone':zone}
    if not isinstance(endpoint,str) or len(endpoint)>4096:raise ValueError('Invalid endpoint')
    sid=identity(endpoint)
    if path=='/api/push/unsubscribe':
        c.execute('DELETE FROM push_subscriptions WHERE id=?',(sid,))
        c.execute('DELETE FROM push_deliveries WHERE subscription=?',(sid,))
        c.commit()
        return 200,{'ok':True}
    if path=='/api/push/status':
        row=c.execute('SELECT zone FROM push_subscriptions WHERE id=?',(sid,)).fetchone()
        return 200,{'enabled':bool(row),'timezone':row[0] if row else None}
    if path=='/api/push/test':
        c.execute('BEGIN IMMEDIATE')
        row=c.execute('SELECT body,last_test FROM push_subscriptions WHERE id=?',(sid,)).fetchone()
        if not row:return 404,{'error':'Сначала включи уведомления'}
        if time.time()-row[1]<30:return 429,{'error':'Повтори проверку через 30 секунд'}
        c.execute('UPDATE push_subscriptions SET last_test=? WHERE id=?',(time.time(),sid));c.commit()
        result=dispatch(json.loads(row[0]),{'title':'Вовремя','body':'Уведомления работают. Напоминания будут приходить по расписанию.','tag':'vovremya-test'})
        if result=='expired':
            c.execute('DELETE FROM push_subscriptions WHERE id=?',(sid,));c.commit()
        if result!='sent':return 502,{'error':'Служба доставки не приняла уведомление. Попробуй включить уведомления заново.'}
        return 200,{'ok':True}
    return 404,{'error':'Не найдено'}

def due(state,zone,created,now):
    local=dt.datetime.fromtimestamp(now,ZoneInfo(zone))
    date=local.date().isoformat()
    for key,moment in schedule_entries(state,date):
        if key in state['taken'] or key in state.get('skipped',{}):continue
        hour,minute=map(int,moment[11:].split(':'))
        scheduled=local.replace(hour=hour,minute=minute,second=0,microsecond=0).timestamp()
        if created<=scheduled and 0<=now-scheduled<300:
            yield key,scheduled


def run_once(now=None,sender=dispatch):
    now=time.time() if now is None else now
    with connect() as c:
        subscriptions=c.execute('SELECT id,body,zone,created FROM push_subscriptions').fetchall()
        c.execute('DELETE FROM push_deliveries WHERE created<?',(now-30*86400,))
        c.commit()
        for sid,body,zone,created in subscriptions:
            state=json.loads(c.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
            for key,scheduled in due(state,zone,created,now):
                base_date,_,clock=key.split('|')
                moment=dt.datetime.fromtimestamp(scheduled,ZoneInfo(zone)).isoformat(timespec='minutes')[:16]
                delivery_key=key if moment==base_date+'T'+clock else key+'@'+moment
                c.execute('INSERT OR IGNORE INTO push_deliveries VALUES(?,?,?,0,0,?)',(sid,delivery_key,'pending',now))
                claimed=c.execute("UPDATE push_deliveries SET attempts=attempts+1,next_try=? WHERE subscription=? AND dose=? AND status='pending' AND attempts<3 AND next_try<=?",(now+45,sid,delivery_key,now))
                c.commit()
                if not claimed.rowcount:continue
                # Fresh read avoids sending a reminder for an already marked dose.
                latest=json.loads(c.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
                if dict(due(latest,zone,created,now)).get(key)!=scheduled:
                    result='cancelled'
                else:
                    result=sender(json.loads(body),{'title':'Время приёма','body':'Пора проверить лекарства в расписании. Открой «Вовремя».','tag':delivery_key},ttl=max(1,int(300-(now-scheduled))))
                if result=='expired':c.execute('DELETE FROM push_subscriptions WHERE id=?',(sid,))
                c.execute('UPDATE push_deliveries SET status=? WHERE subscription=? AND dose=?',('pending' if result=='retry' else result,sid,delivery_key))
                c.commit()

def worker():
    while True:
        try:run_once()
        except Exception:logging.error('Reminder cycle failed; will retry')
        time.sleep(20)

def start():threading.Thread(target=worker,daemon=True).start()
