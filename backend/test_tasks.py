import copy
import datetime as dt
import hashlib
import importlib
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import tasks

TASK = {'id': 'test-task', 'title': 'Тестовое дело', 'note': '', 'date': '2026-09-30', 'time': '09:00', 'repeat': 'once', 'days': [2], 'timezone': 'Asia/Dubai'}
NOW = dt.datetime(2026, 9, 30, 5, 0, 20, tzinfo=dt.timezone.utc).timestamp()

class TasksTests(unittest.TestCase):
    def test_dates_completion_and_timezone(self):
        state = {'tasks': [copy.deepcopy(TASK)], 'done': {}}
        self.assertEqual(len(list(tasks.due(state, 0, NOW))), 1)
        self.assertEqual(list(tasks.due(state, NOW, NOW)), [])
        self.assertEqual(list(tasks.due(state, 0, NOW+301)), [])
        self.assertEqual(list(tasks.due(state, 0, NOW+86400)), [])
        state['tasks'][0]['repeat'] = 'daily'
        self.assertEqual(len(list(tasks.due(state, 0, NOW+86400))), 1)
        state['done']['test-task|2026-09-30'] = '2026-09-30T05:00:00Z'
        self.assertEqual(list(tasks.due(state, 0, NOW)), [])
        self.assertEqual(len(list(tasks.due(state, 0, NOW+86400))), 1)
        state['tasks'][0]['repeat'] = 'weekly'
        self.assertEqual(list(tasks.due(state, 0, NOW+86400)), [])
        self.assertEqual(len(list(tasks.due(state, 0, NOW+7*86400))), 1)
        self.assertEqual(list(tasks.due(state, 0, NOW-7*86400)), [])
        state['done'] = {}
        state['tasks'][0].update(repeat='once', time='23:59')
        midnight = dt.datetime(2026, 9, 30, 20, 1, tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(len(list(tasks.due(state, 0, midnight))), 1)
        state['tasks'][0].update(date='2026-03-08', time='02:30', timezone='America/New_York')
        gap = dt.datetime(2026, 3, 8, 7, 30, tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(list(tasks.due(state, 0, gap)), [])

    def test_validation(self):
        state = {'tasks': [copy.deepcopy(TASK)], 'done': {}}
        self.assertEqual(tasks.validate(state), state)
        for field, value in [('title', '  '), ('timezone', '../etc/passwd'), ('date', '2026-02-30'), ('time', '24:00'), ('days', [True]), ('days', [1, 1]), ('repeat', 'unknown')]:
            invalid = copy.deepcopy(state); invalid['tasks'][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                tasks.validate(invalid)
        invalid = copy.deepcopy(state); invalid['tasks'][0].update(repeat='weekly', days=[])
        with self.assertRaises(ValueError): tasks.validate(invalid)
        invalid = copy.deepcopy(state); invalid['done']['unknown|2026-09-30'] = '2026-09-30T05:00:00Z'
        with self.assertRaises(ValueError): tasks.validate(invalid)

    def test_api_and_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['DATA_DIR'] = directory
            import server
            importlib.reload(server.push_system); importlib.reload(server); server.initialize()
            p = server.push_system
            with server.db() as c:
                c.execute('INSERT INTO sessions VALUES(?,?)', (hashlib.sha256(b'test-only').hexdigest(), time.time()+60))
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.API)
            thread = threading.Thread(target=http.serve_forever, daemon=True); thread.start()
            def request(body=None, cookie=True, origin=server.ORIGIN):
                headers = {'Content-Type': 'application/json', 'Origin': origin}
                if cookie: headers['Cookie'] = 'session=test-only'
                req = urllib.request.Request('http://127.0.0.1:'+str(http.server_port)+'/api/tasks', data=None if body is None else json.dumps(body).encode(), headers=headers)
                try: response = urllib.request.urlopen(req)
                except urllib.error.HTTPError as error: response = error
                with response: return response.status, json.loads(response.read())
            try:
                state = {'tasks': [copy.deepcopy(TASK)], 'done': {}}
                self.assertEqual(request(cookie=False)[0], 401)
                self.assertEqual(request({'state': state, 'version': 0}, cookie=False)[0], 401)
                self.assertEqual(request({'state': state, 'version': 0}, origin='https://evil.test')[0], 403)
                self.assertEqual(request()[1], {'state': tasks.EMPTY, 'version': 0})
                self.assertEqual(request({'state': state, 'version': 0})[0], 200)
                self.assertEqual(request({'state': state, 'version': 0})[0], 409)
                self.assertEqual(request()[1]['state'], state)
                calls = []
                def sender(sub, payload, **kw): calls.append((sub, payload, kw)); return 'sent'
                with server.db() as c:
                    for sid, zone in [('a', 'Asia/Dubai'), ('b', 'UTC')]:
                        c.execute('INSERT INTO push_subscriptions(id,body,zone,created) VALUES(?,?,?,?)', (sid, '{}', zone, NOW-100))
                p.run_once(NOW, sender); p.run_once(NOW+20, sender)
                self.assertEqual(len(calls), 2)
                self.assertEqual(calls[0][1]['url'], '/tasks/?task=test-task')
                self.assertEqual(calls[0][2]['ttl'], 280)
                self.assertNotIn(TASK['title'], calls[0][1]['body'])
                with server.db() as c: c.execute('DELETE FROM push_deliveries')
                retries = []
                def retry(*a, **k): retries.append(1); return 'retry'
                for offset in [0, 20, 46, 92, 140]: p.run_once(NOW+offset, retry)
                self.assertEqual(len(retries), 6)
                state['done']['test-task|2026-09-30'] = '2026-09-30T05:00:00Z'
                self.assertEqual(request({'state': state, 'version': 1})[0], 200)
                with server.db() as c: c.execute('DELETE FROM push_deliveries')
                calls.clear(); p.run_once(NOW, sender); self.assertEqual(calls, [])
                state['done'] = {}; state['tasks'][0]['title'] = 'Отредактировано'
                self.assertEqual(request({'state': state, 'version': 2})[0], 200)
                # Completion between selecting and dispatching cancels the delivery.
                original = tasks.read
                count = 0
                def completed(c):
                    nonlocal count
                    count += 1; result = original(c)
                    if count >= 2: result['state']['done']['test-task|2026-09-30'] = '2026-09-30T05:00:00Z'
                    return result
                with patch.object(tasks, 'read', completed): p.run_once(NOW, sender)
                self.assertEqual(calls, [])
                self.assertEqual(request({'state': tasks.EMPTY, 'version': 3})[0], 200)
                self.assertEqual(request()[1]['state'], tasks.EMPTY)
                with server.db() as c:
                    self.assertEqual(json.loads(c.execute('SELECT body FROM state').fetchone()[0]), server.EMPTY)
            finally:
                http.shutdown(); thread.join(); http.server_close()

if __name__ == '__main__': unittest.main()
