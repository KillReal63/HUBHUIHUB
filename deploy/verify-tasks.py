"""Read-only live route/data checks with a disposable shared session."""
import hashlib
import json
import secrets
import sqlite3
import time
import urllib.error
import urllib.request

def request(path, token=None):
    headers = {'Cookie': 'session='+token} if token else {}
    try:
        response = urllib.request.urlopen(urllib.request.Request('https://144.31.166.231'+path, headers=headers), timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()

assert request('/api/tasks')[0] == 401
for path in ['/tasks/', '/tasks/tasks.js', '/tasks/tasks.css', '/tasks/schedule.js', '/sw.js', '/vovrema/sw.js', '/vovrema/push.js']:
    assert request(path)[0] == 200, path
assert b'href="/tasks/"' in request('/')[1]
assert b'notificationTarget' in request('/sw.js')[1]
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
with sqlite3.connect('/var/lib/vovremya/app.sqlite3') as db:
    db.execute('INSERT INTO sessions VALUES(?,?)', (digest, int(time.time())+60))
try:
    for path in ['/api/tasks', '/api/state', '/api/auth-check', '/gym/']:
        assert request(path, token)[0] == 200, path
    data = json.loads(request('/api/tasks', token)[1])
    assert isinstance(data['version'], int) and set(data['state']) == {'tasks', 'done'}
finally:
    with sqlite3.connect('/var/lib/vovremya/app.sqlite3') as db:
        db.execute('DELETE FROM sessions WHERE token=?', (digest,))
print('PASS: task routes, shared authorization, isolated task storage and notification worker')
