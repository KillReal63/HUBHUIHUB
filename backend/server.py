"""Single-user medication API. Python standard library + SQLite, behind Nginx."""
import datetime as dt
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
import push_system
import tasks
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA = Path(os.environ.get('DATA_DIR', '/var/lib/vovremya'))
ORIGIN = os.environ.get('APP_ORIGIN', 'https://144.31.166.231')
EMPTY = {'meds': [], 'taken': {}}

@contextmanager
def db():
    c = sqlite3.connect(DATA / 'app.sqlite3', timeout=10)
    try:
        c.execute('PRAGMA busy_timeout=10000')
        with c:
            yield c
    finally:
        c.close()

def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS account(id INTEGER PRIMARY KEY CHECK(id=1),salt TEXT NOT NULL,password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
        ''')
        c.execute('INSERT OR IGNORE INTO state VALUES(1,0,?)', (json.dumps(EMPTY),))
        if not c.execute('SELECT 1 FROM account').fetchone() and not (DATA/'setup-token').exists():
            fd = os.open(DATA/'setup-token', os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as f:
                f.write(secrets.token_urlsafe(32))
        tasks.initialize(c)
    push_system.initialize()

def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()

def valid_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Некорректная дата')
    dt.date.fromisoformat(value)
    return value

def valid_moment(value):
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d',value):raise ValueError('Некорректная дата и время')
    dt.datetime.fromisoformat(value)

def valid_stamp(value):
    if not isinstance(value,str) or len(value)>40:raise ValueError('Некорректная отметка')
    stamp=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if stamp.tzinfo is None:raise ValueError('Не указан часовой пояс отметки')

def validate_state(value):
    if not isinstance(value, dict) or set(value)-{'skipped','fixed'} != {'meds','taken'}:
        raise ValueError('Некорректные данные')
    meds, taken = value['meds'], value['taken']
    if not isinstance(meds, list) or len(meds)>500 or not isinstance(taken, dict) or len(taken)>50000:
        raise ValueError('Слишком много записей')
    ids = set()
    for m in meds:
        if not isinstance(m, dict) or set(m) - {'cycle','category','meal','durationDays','shifts'} != {'id','name','dose','start','end','days','times','note'}:
            raise ValueError('Некорректное лекарство')
        if 'meal' in m and (not isinstance(m['meal'], str) or m['meal'] not in ('before','after','any','fasting')):
            raise ValueError('Некорректное отношение к еде')
        if 'category' in m and (not isinstance(m['category'], str) or m['category'] not in ('pill','ointment','supplement','action','spray','drops','injection')):
            raise ValueError('Некорректная категория')
        shifts=m.get('shifts',[])
        if not isinstance(shifts,list) or len(shifts)>200:raise ValueError('Слишком много переносов')
        total=0
        for shift in shifts:
            if not isinstance(shift,dict) or set(shift)!={'from','minutes','at'}:raise ValueError('Некорректный перенос')
            valid_moment(shift['from'])
            if type(shift['minutes']) is not int or not 1<=shift['minutes']<=525600:raise ValueError('Некорректный перенос')
            total+=shift['minutes'];valid_stamp(shift['at'])
        if total>5256000:raise ValueError('Слишком большой сдвиг курса')
        if 'cycle' in m:
            cycle = m['cycle']
            if not isinstance(cycle, dict) or set(cycle) != {'on','off'} or any(type(n) is not int or not 1 <= n <= 365 for n in cycle.values()):
                raise ValueError('Дни приёма и перерыва: целые числа от 1 до 365')
        if not isinstance(m['id'], str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', m['id']) or m['id'] in ids:
            raise ValueError('Некорректный идентификатор')
        ids.add(m['id'])
        for field, limit in [('name',80),('dose',80),('note',160)]:
            required = field == 'name' or (field == 'dose' and m.get('category') not in ('action','ointment'))
            if not isinstance(m[field],str) or len(m[field])>limit or (required and not m[field].strip()):
                raise ValueError('Проверь название и дозировку')
        valid_date(m['start'])
        if 'durationDays' in m:
            n=m['durationDays']
            if type(n) is not int or not 1 <= n <= 3650 or 'cycle' in m:
                raise ValueError('Некорректная длительность курса')
            if m['end'] != (dt.date.fromisoformat(m['start'])+dt.timedelta(days=n-1)).isoformat() or sorted(m['days']) != list(range(7)):
                raise ValueError('Курс N дней должен быть ежедневным с корректной датой окончания')
        if m['end'] != '':
            valid_date(m['end'])
            if m['end']<m['start']: raise ValueError('Конец курса раньше начала')
        if not isinstance(m['days'],list) or not 1<=len(m['days'])<=7 or any(type(d)!=int or not 0<=d<=6 for d in m['days']) or len(set(m['days']))!=len(m['days']):
            raise ValueError('Некорректные дни недели')
        if not isinstance(m['times'],list) or not 0<=len(m['times'])<=48 or any(not isinstance(t,str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',t) for t in m['times']) or len(set(m['times']))!=len(m['times']):
            raise ValueError('Некорректное время')
    for key, stamp in taken.items():
        if not isinstance(key,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}\|[a-zA-Z0-9-]{1,80}\|([01]\d|2[0-3]):[0-5]\d',key):
            raise ValueError('Некорректная отметка')
        valid_date(key[:10])
        if not isinstance(stamp,str) or len(stamp)>40: raise ValueError('Некорректная отметка')
        dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
    skipped=value.get('skipped',{});fixed=value.get('fixed',{})
    for mapping in (skipped,fixed):
        if not isinstance(mapping,dict) or len(mapping)>50000:raise ValueError('Слишком много отметок')
        for key in mapping:
            if not isinstance(key,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}\|[a-zA-Z0-9-]{1,80}\|([01]\d|2[0-3]):[0-5]\d',key):raise ValueError('Некорректная отметка')
            valid_date(key[:10])
    if set(skipped)&set(taken):raise ValueError('Приём одновременно принят и пропущен')
    for stamp in skipped.values():valid_stamp(stamp)
    for key,moment in fixed.items():
        valid_moment(moment)
        if key not in taken and key not in skipped:raise ValueError('Нет отметки для даты приёма')
    return value

class API(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log passwords, cookies or medication data.

    def reply(self, status, body, cookie=None):
        data=json.dumps(body,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(data)))
        if cookie: self.send_header('Set-Cookie',cookie)
        self.end_headers()
        self.wfile.write(data)

    def token(self):
        try:
            cookie=SimpleCookie(self.headers.get('Cookie',''))
            return hashlib.sha256(cookie['session'].value.encode()).hexdigest()
        except Exception:
            return ''

    def authenticated(self,c):
        return c.execute('SELECT 1 FROM sessions WHERE token=? AND expires>?',(self.token(),time.time())).fetchone() is not None

    def do_GET(self):
        with db() as c:
            if self.path=='/api/session':
                self.reply(200,{'authenticated':self.authenticated(c),'setupRequired':not bool(c.execute('SELECT 1 FROM account').fetchone())})
            elif self.path=='/api/auth-check':
                self.reply(200 if self.authenticated(c) else 401, {})
            elif self.path=='/api/push/key':
                if not self.authenticated(c): return self.reply(401,{'error':'Войди в аккаунт'})
                self.reply(200,{'publicKey':push_system.public_key()})
            elif self.path=='/api/tasks':
                if not self.authenticated(c): return self.reply(401,{'error':'Войди в аккаунт'})
                self.reply(200,tasks.read(c))
            elif self.path=='/api/state':
                if not self.authenticated(c): return self.reply(401,{'error':'Войди в аккаунт'})
                version, body=c.execute('SELECT version,body FROM state WHERE id=1').fetchone()
                self.reply(200,{'version':version,'state':json.loads(body)})
            else: self.reply(404,{'error':'Не найдено'})

    def do_POST(self):
        if self.headers.get('Origin') != ORIGIN:
            return self.reply(403,{'error':'Недопустимый источник запроса'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=2_000_000: return self.reply(413,{'error':'Слишком большой запрос'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':
                return self.reply(415,{'error':'Требуется JSON'})
            body=json.loads(self.rfile.read(length))
            if not isinstance(body,dict): raise ValueError('Некорректный запрос')
            with db() as c:
                if self.path in ('/api/login','/api/setup'):
                    ip=self.headers.get('X-Real-IP',self.client_address[0])
                    now=int(time.time())
                    c.execute('BEGIN IMMEDIATE')
                    c.execute('DELETE FROM attempts WHERE until<?',(now,))
                    row=c.execute('SELECT count FROM attempts WHERE ip=?',(ip,)).fetchone()
                    if row and row[0]>=10: return self.reply(429,{'error':'Слишком много попыток. Попробуй через 15 минут.'})
                    c.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1',(ip,now+900))
                    c.commit()
                    password=body.get('password','')
                    if not isinstance(password,str) or not 12<=len(password)<=256:
                        return self.reply(400,{'error':'Пароль должен содержать от 12 до 256 символов'})
                    c.execute('BEGIN IMMEDIATE')
                    account=c.execute('SELECT salt,password FROM account WHERE id=1').fetchone()
                    if self.path=='/api/setup':
                        if account: return self.reply(409,{'error':'Аккаунт уже создан. Войди с паролем.'})
                        token=body.get('token','')
                        if not isinstance(token,str) or not hmac.compare_digest(token,(DATA/'setup-token').read_text().strip()):
                            return self.reply(403,{'error':'Неверный код активации'})
                        salt=secrets.token_hex(16)
                        c.execute('INSERT INTO account VALUES(1,?,?)',(salt,password_hash(password,salt)))
                    elif not account or not hmac.compare_digest(account[1],password_hash(password,account[0])):
                        return self.reply(401,{'error':'Неверный пароль'})
                    session=secrets.token_urlsafe(32)
                    c.execute('DELETE FROM sessions WHERE expires<?',(now,))
                    c.execute('DELETE FROM attempts WHERE ip=?',(ip,))
                    c.execute('INSERT INTO sessions VALUES(?,?)',(hashlib.sha256(session.encode()).hexdigest(),now+604800))
                    c.commit()
                    if self.path=='/api/setup': (DATA/'setup-token').unlink(missing_ok=True)
                    return self.reply(200,{'ok':True},f'session={session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800')
                if not self.authenticated(c): return self.reply(401,{'error':'Сессия закончилась. Войди снова.'})
                if self.path=='/api/tasks':
                    status,result=tasks.save(c,body)
                    return self.reply(status,result)
                if self.path.startswith('/api/push/'):
                    status,result=push_system.api(c,self.path,body)
                    return self.reply(status,result)
                if self.path=='/api/logout':
                    c.execute('DELETE FROM sessions WHERE token=?',(self.token(),))
                    c.commit()
                    return self.reply(200,{'ok':True},'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
                if self.path=='/api/state':
                    data=validate_state(body.get('state'))
                    version=body.get('version')
                    if type(version)!=int or version<0: raise ValueError('Некорректная версия')
                    previous=json.loads(c.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
                    old_meds={m['id']:m for m in previous['meds']}
                    if any(previous.get(field) and field not in data for field in ('skipped','fixed')) or any(old_meds.get(m['id'],{}).get('shifts') and 'shifts' not in m for m in data['meds']):
                        return self.reply(409,{'error':'Обнови страницу: в расписании есть переносы, которые эта версия не поддерживает.'})
                    result=c.execute('UPDATE state SET body=?,version=version+1 WHERE id=1 AND version=?',(json.dumps(data,ensure_ascii=False),version))
                    if result.rowcount!=1: return self.reply(409,{'error':'Данные изменились на другом устройстве. Расписание обновлено; повтори изменение.'})
                    c.commit()
                    return self.reply(200,{'version':version+1})
                self.reply(404,{'error':'Не найдено'})
        except (ValueError, TypeError, KeyError):
            self.reply(400,{'error':'Некорректные данные. Проверь поля.'})
        except Exception:
            self.reply(500,{'error':'Ошибка сервера. Попробуй ещё раз.'})

if __name__=='__main__':
    os.umask(0o077)
    initialize()
    push_system.start()
    ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PORT','8765'))),API).serve_forever()
