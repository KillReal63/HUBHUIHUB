"""Check live HTTPS routes using a disposable session, never user credentials."""
import hashlib
import json
import secrets
import sqlite3
import time
import urllib.error
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

opener = urllib.request.build_opener(NoRedirect)
def request(path, token=None):
    headers = {'Cookie': 'session='+token} if token else {}
    try:
        response = opener.open(urllib.request.Request('https://144.31.166.231'+path, headers=headers), timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read(), response.headers

assert request('/')[0] == 200
assert 'Мой день'.encode() in request('/')[1]
assert request('/api/state')[0] == 401
assert request('/api/auth-check')[0] == 401
for path in ['/gym/', '/gym/program']:
    status, _, headers = request(path)
    assert status == 302 and headers['Location'].startswith('https://144.31.166.231/?next='), (path, status, headers)
for path in ['/hub/hub.css', '/hub/hub.js', '/vovrema/', '/vovrema/push.js', '/sw.js']:
    assert request(path)[0] == 200, path
manifest = json.loads(request('/manifest.webmanifest')[1])
assert manifest['id'] == manifest['scope'] == manifest['start_url'] == '/'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
with sqlite3.connect('/var/lib/vovremya/app.sqlite3') as db:
    db.execute('INSERT INTO sessions VALUES(?,?)', (digest, int(time.time())+60))
try:
    for path in ['/api/auth-check', '/api/state', '/vovrema/api/state', '/gym/', '/gym/program', '/gym/style.css']:
        assert request(path, token)[0] == 200, path
finally:
    with sqlite3.connect('/var/lib/vovremya/app.sqlite3') as db:
        db.execute('DELETE FROM sessions WHERE token=?', (digest,))
print('PASS: HTTPS hub, shared session, gym access control, medication API and PWA routes')
