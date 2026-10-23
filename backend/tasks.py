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
        required = {'id', 'title', 'note', 'date', 'time', 'repeat', 'days', 'timezone'}
        if not isinstance(task, dict) or not required <= set(task) or set(task) - required - {'interval', 'shifts', 'subtasks', 'subtaskDone', 'reminderMinutes'}:
            raise ValueError('Invalid task')
        if type(task.get('reminderMinutes', 0)) is not int or task.get('reminderMinutes', 0) not in (0, 10, 30, 60):
            raise ValueError('Invalid reminder interval')
        if not isinstance(task['id'], str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', task['id']) or task['id'] in ids:
            raise ValueError('Invalid id')
        ids.add(task['id'])
        subtasks = task.get('subtasks', [])
        if not isinstance(subtasks, list) or len(subtasks) > 50:
            raise ValueError('В одном деле может быть до 50 подзадач')
        subtask_ids = set()
        for item in subtasks:
            if not isinstance(item, dict) or set(item) != {'id', 'title'}:
                raise ValueError('Invalid subtask')
            if not isinstance(item['id'], str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', item['id']) or item['id'] in subtask_ids:
                raise ValueError('Invalid subtask id')
            if not isinstance(item['title'], str) or not item['title'].strip() or len(item['title']) > 120:
                raise ValueError('Invalid subtask title')
            subtask_ids.add(item['id'])
        checks = task.get('subtaskDone', {})
        if not isinstance(checks, dict) or len(checks) > 50000:
            raise ValueError('Invalid subtask completions')
        for day, checked in checks.items():
            date(day)
            if not isinstance(checked, list) or len(checked) > len(subtask_ids) or any(not isinstance(sid, str) or sid not in subtask_ids for sid in checked) or len(set(checked)) != len(checked):
                raise ValueError('Invalid subtask completion')
        for field, limit in [('title', 120), ('note', 1000)]:
            if not isinstance(task[field], str) or len(task[field]) > limit or (field == 'title' and not task[field].strip()):
                raise ValueError('Invalid text')
        date(task['date'])
        if not isinstance(task['time'], str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', task['time']):
            raise ValueError('Invalid time')
        if task['repeat'] not in ('once', 'daily', 'weekly', 'interval'):
            raise ValueError('Invalid repeat')
        if 'interval' in task or task['repeat'] == 'interval':
            if type(task.get('interval')) is not int or not 1 <= task['interval'] <= 365:
                raise ValueError('Интервал должен быть от 1 до 365 дней')
        days = task['days']
        if not isinstance(days, list) or len(days) > 7 or any(type(d) is not int or not 0 <= d <= 6 for d in days) or len(set(days)) != len(days) or (task['repeat'] == 'weekly' and not days):
            raise ValueError('Invalid weekdays')
        if not isinstance(task['timezone'], str) or len(task['timezone']) > 80:
            raise ValueError('Invalid timezone')
        try:
            ZoneInfo(task['timezone'])
        except Exception:
            raise ValueError('Invalid timezone') from None
        shifts = task.get('shifts', {})
        if not isinstance(shifts, dict) or len(shifts) > 1000:
            raise ValueError('Invalid shifts')
        for original, target in shifts.items():
            source = date(original)
            if not occurs(task, source) or not isinstance(target, dict) or set(target) != {'date', 'time'}:
                raise ValueError('Invalid shifted occurrence')
            date(target['date'])
            if not isinstance(target['time'], str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', target['time']):
                raise ValueError('Invalid shift time')
            moment = dt.datetime.combine(date(target['date']), dt.time.fromisoformat(target['time']), ZoneInfo(task['timezone']))
            if dt.datetime.fromtimestamp(moment.timestamp(), moment.tzinfo).replace(tzinfo=None) != moment.replace(tzinfo=None):
                raise ValueError('Это время отсутствует из-за перевода часов. Выбери другое.')
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
    previous = {task['id']:task for task in read(c)['state']['tasks']}
    for task in state['tasks']:
        # Older editors omit the setting; only an explicit zero disables it.
        old = previous.get(task['id'], {})
        if 'reminderMinutes' not in task and 'reminderMinutes' in old:
            task['reminderMinutes'] = old['reminderMinutes']
    has_links = c.execute("SELECT 1 FROM sqlite_master WHERE name='food_links'").fetchone()
    if has_links:
        linked = {r[0] for r in c.execute('SELECT task FROM food_links WHERE task IS NOT NULL')}
        if any(t['id'] in linked and t['repeat'] != 'once' for t in state['tasks']):
            return 400, {'error':'Связанная покупка должна быть разовой. Новую покупку создаёт правило питания.'}
    updated = c.execute('UPDATE tasks_state SET body=?,version=version+1 WHERE id=1 AND version=?', (json.dumps(state, ensure_ascii=False), version))
    if not updated.rowcount:
        return 409, {'error': 'Дела изменились на другом устройстве. Список обновлён; повтори действие.'}
    # Remember explicit completion/deletion even if it is undone before the next worker tick.
    if has_links:
        by_id = {t['id']:t for t in state['tasks']}
        for product, tid in c.execute('SELECT product,task FROM food_links WHERE task IS NOT NULL').fetchall():
            task = by_id.get(tid)
            if task is None or tid+'|'+task['date'] in state['done']:
                c.execute('UPDATE food_links SET suppressed=1 WHERE product=?',(product,))
            else:
                c.execute('UPDATE food_links SET suppressed=0 WHERE product=?',(product,))
    c.commit()
    return 200, {'version': version+1}

def occurs(task, day):
    start = dt.date.fromisoformat(task['date'])
    if day < start:
        return False
    repeat = task['repeat']
    return (repeat == 'once' and day == start or repeat == 'daily' or
            repeat == 'interval' and (day-start).days % task['interval'] == 0 or
            repeat == 'weekly' and day.weekday() in task['days'])

def due(state, created, now):
    for task in state['tasks']:
        zone = ZoneInfo(task['timezone'])
        local = dt.datetime.fromtimestamp(now, zone)
        # Include yesterday when a notification is due just before midnight.
        shifts = task.get('shifts', {})
        candidates = {local.date()-dt.timedelta(days=1), local.date()}
        candidates.update(dt.date.fromisoformat(day) for day in shifts)
        for day in sorted(candidates):
            occurrence = task['id']+'|'+day.isoformat()
            if not occurs(task, day) or occurrence in state['done']:
                continue
            target = shifts.get(day.isoformat(), {'date': day.isoformat(), 'time': task['time']})
            hour, minute = map(int, target['time'].split(':'))
            moment = dt.datetime.combine(dt.date.fromisoformat(target['date']), dt.time(hour, minute), zone)
            scheduled = moment.timestamp()
            # Skip nonexistent spring-forward times; fall-back uses the first occurrence.
            if dt.datetime.fromtimestamp(scheduled, zone).replace(tzinfo=None) != moment.replace(tzinfo=None):
                continue
            if created > scheduled:
                continue
            base_key = 'task|'+occurrence+'|'+str(int(scheduled))
            minutes = task.get('reminderMinutes', 0)
            for index in range(4 if minutes else 1):
                reminder_at = scheduled + index * minutes * 60
                if 0 <= now-reminder_at < 300:
                    # Keep the original delivery key. Follow-up identities do not
                    # change when editing the interval, so sent slots stay sent.
                    key = base_key if index == 0 else base_key+'|reminder|'+str(index)
                    yield key, reminder_at, task['id']

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
                    'title': 'Мой день · Дела', 'body': 'Дело ещё не отмечено выполненным. Открой напоминание.' if '|reminder|' in key else 'Есть дело на это время. Открой напоминание.',
                    'tag': key, 'url': '/tasks/?task='+tid,
                }, ttl=max(1, int(300-(now-scheduled))))
            if result == 'expired':
                c.execute('DELETE FROM push_subscriptions WHERE id=?', (sid,))
            c.execute('UPDATE push_deliveries SET status=? WHERE subscription=? AND dose=?', ('pending' if result == 'retry' else result, sid, key))
            c.commit()
            if result == 'expired':
                break
