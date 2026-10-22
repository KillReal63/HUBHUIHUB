import copy
from contextlib import closing
import sqlite3
import unittest

import tasks
from test_tasks import TASK, NOW


class SubtaskTests(unittest.TestCase):
    def state(self):
        return {'tasks': [dict(copy.deepcopy(TASK), repeat='daily',
                              subtasks=[{'id': 'passport', 'title': 'Паспорт'}, {'id': 'form', 'title': 'Анкета'}],
                              subtaskDone={'2026-09-30': ['passport']})], 'done': {}}

    def test_validation_and_old_records(self):
        self.assertEqual(tasks.validate(self.state()), self.state())
        tasks.validate({'tasks': [copy.deepcopy(TASK)], 'done': {}})
        bad = [({'subtasks': 'wrong'}), {'subtasks': [{'id': 'x', 'title': '  '}]},
               {'subtasks': [{'id': 'x', 'title': 'X'}]*2},
               {'subtasks': [{'id': 'x', 'title': 'X'*121}]},
               {'subtaskDone': {'2026-09-30': ['missing']}},
               {'subtaskDone': {'2026-09-30': ['passport', 'passport']}},
               {'subtaskDone': {'2026-09-30': [True]}},
               {'subtaskDone': {'2026-02-30': ['passport']}},
               {'subtaskDone': []},
               {'subtasks': [{'id': str(i), 'title': 'X'} for i in range(51)]}]
        for fields in bad:
            state = self.state();state['tasks'][0].update(fields)
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                tasks.validate(state)

    def test_partial_checks_do_not_complete_or_suppress_push(self):
        state = self.state()
        self.assertEqual(len(list(tasks.due(state, 0, NOW))), 1)
        state['tasks'][0]['subtaskDone']['2026-09-30'].append('form')
        self.assertEqual(len(list(tasks.due(state, 0, NOW))), 1)
        state['done']['test-task|2026-09-30'] = '2026-09-30T05:00:00Z'
        self.assertEqual(list(tasks.due(state, 0, NOW)), [])
        self.assertEqual(len(list(tasks.due(state, 0, NOW+86400))), 1)

    def test_persistence_move_rename_and_stale_update(self):
        with closing(sqlite3.connect(':memory:')) as c:
            tasks.initialize(c)
            state = self.state()
            self.assertEqual(tasks.save(c, {'state': state, 'version': 0})[0], 200)
            stale = copy.deepcopy(tasks.read(c))
            update = tasks.read(c)
            task = update['state']['tasks'][0]
            task['subtasks'][0]['title'] = 'Загранпаспорт'
            task['shifts'] = {'2026-09-30': {'date': '2026-10-01', 'time': '10:00'}}
            self.assertEqual(tasks.save(c, update)[0], 200)
            stale['state']['tasks'][0]['subtaskDone']['2026-10-01'] = ['form']
            self.assertEqual(tasks.save(c, stale)[0], 409)
            saved = tasks.read(c)['state']['tasks'][0]
            self.assertEqual(saved['subtaskDone'], {'2026-09-30': ['passport']})
            self.assertEqual(saved['subtasks'][0]['title'], 'Загранпаспорт')


if __name__ == '__main__':
    unittest.main()
