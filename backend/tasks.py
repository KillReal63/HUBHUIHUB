"""Personal tasks, separate from medication state, using the shared account/push."""
import datetime as dt
import json
import re
from zoneinfo import ZoneInfo

EMPTY = {'tasks': [], 'done': {}}

def initialize(c):
    c.execute('CREATE TABLE IF NOT EXISTS tasks_state(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,body TEXT NOT NULL)')
    c.execute('INSERT OR IGNORE INTO tasks_state VALUES(1,0,?)', (json.dumps(EMPTY),))

def read(c):
    version, body = c.execute('SELECT version,body FROM tasks_state WHERE id=1').fetchone()
    return {'version': version, 'state': json.loads(body)}

def date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Invalid date')
    parsed = dt.date.fromisoformat(value)
    if not 2000 <= parsed.year <= 2100:
        raise ValueError('Date out of range')
    return parsed

def validate(state):
    if not isinstance(state, dict) or set(state) != {'tasks', 'done'}:
        raise ValueError('Invalid tasks')
    items, done = state['tasks'], state['done']
    if not isinstance(items, list) or len(items) > 300 or not isinstance(done, dict) or len(done) > 50000:
        raise ValueError('Too many tasks')
    ids = set()
    for task in items:
        if not isinstance(task, dict) or set(task) != {'id', 'title', 'note', 'date', 'time', 'repeat', 'days', 'timezone'}:
            raise ValueError('Invalid task')
        if not isinstance(task['id'], str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', task['id']) or task['id'] in ids:
            raise ValueError('Invalid id')
        ids.add(task['id'])
        for field, limit in [('title', 120), ('note', 1000)]:
            if not isinstance(task[field], str) or len(task[field]) > limit or (field == 'title' and not task[field].strip()):
                raise ValueError('Invalid text')
        date(task['date'])
        if not isinstance(task['time'], str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', task['time']):
            raise ValueError('Invalid time')
        if task['repeat'] not in ('once', 'daily', 'weekly'):
            raise ValueError('Invalid repeat')
        days = task['days']
        if not isinstance(days, list) or len(days) > 7 or any(type(d) is not int or not 0 <= d <= 6 for d in days) or len(set(days)) != len(days) or (task['repeat'] == 'weekly' and not days):
            raise ValueError('Invalid weekdays')
        if not isinstance(task['timezone'], str) or len(task['timezone']) > 80:
            raise ValueError('Invalid timezone')
        try:
            ZoneInfo(task['timezone'])
        except Exception:
            raise ValueError('Invalid timezone') from None
    for key, stamp in done.items():
        if not isinstance(key, str) or len(key.split('|')) != 2:
            raise ValueError('Invalid completion')
        tid, day = key.split('|')
        if tid not in ids:
            raise ValueError('Unknown task')
        date(day)
        if not isinstance(stamp, str) or len(stamp) > 40 or dt.datetime.fromisoformat(stamp.replace('Z', '+00:00')).tzinfo is None:
            raise ValueError('Invalid timestamp')
    return state

def save(c, body):
    state = validate(body.get('state'))
    version = body.get('version')
    if type(version) is not int or version < 0:
        raise ValueError('Invalid version')
    updated = c.execute('UPDATE tasks_state SET body=?,version=version+1 WHERE id=1 AND version=?', (json.dumps(state, ensure_ascii=False), version))
    if not updated.rowcount:
        return 409, {'error': 'Дела изменились на другом устройстве. Список обновлён; повтори действие.'}
    c.commit()
    return 200, {'version': version+1}

def occurs(task, day):
    start = dt.date.fromisoformat(task['date'])
    if day < start:
        return False
    repeat = task['repeat']
    return (repeat == 'once' and day == start or repeat == 'daily' or
            repeat == 'weekly' and day.weekday() in task['days'])

def due(state, created, now):
    for task in state['tasks']:
        zone = ZoneInfo(task['timezone'])
        local = dt.datetime.fromtimestamp(now, zone)
        # Include yesterday when a notification is due just before midnight.
        for day in (local.date()-dt.timedelta(days=1), local.date()):
            occurrence = task['id']+'|'+day.isoformat()
            if not occurs(task, day) or occurrence in state['done']:
                continue
            hour, minute = map(int, task['time'].split(':'))
            moment = dt.datetime.combine(day, dt.time(hour, minute), zone)
            scheduled = moment.timestamp()
            # Skip nonexistent spring-forward times; fall-back uses the first occurrence.
            if dt.datetime.fromtimestamp(scheduled, zone).replace(tzinfo=None) != moment.replace(tzinfo=None):
                continue
            if created <= scheduled and 0 <= now-scheduled < 300:
                key = 'task|'+occurrence+'|'+str(int(scheduled))
                yield key, scheduled, task['id']

def deliver(c, now, sender):
    subscriptions = c.execute('SELECT id,body,created FROM push_subscriptions').fetchall()
    for sid, body, created in subscriptions:
        state = read(c)['state']
        for key, scheduled, tid in due(state, created, now):
            c.execute('INSERT OR IGNORE INTO push_deliveries VALUES(?,?,?,0,0,?)', (sid, key, 'pending', now))
            claimed = c.execute("UPDATE push_deliveries SET attempts=attempts+1,next_try=? WHERE subscription=? AND dose=? AND status='pending' AND attempts<3 AND next_try<=?", (now+45, sid, key, now))
            c.commit()
            if not claimed.rowcount:
                continue
            latest = {item[0] for item in due(read(c)['state'], created, now)}
            if key not in latest:
                result = 'cancelled'
            else:
                result = sender(json.loads(body), {
                    'title': 'Мой день · Дела', 'body': 'Есть дело на это время. Открой напоминание.',
                    'tag': key, 'url': '/tasks/?task='+tid,
                }, ttl=max(1, int(300-(now-scheduled))))
            if result == 'expired':
                c.execute('DELETE FROM push_subscriptions WHERE id=?', (sid,))
            c.execute('UPDATE push_deliveries SET status=? WHERE subscription=? AND dose=?', ('pending' if result == 'retry' else result, sid, key))
            c.commit()
            if result == 'expired':
                break
