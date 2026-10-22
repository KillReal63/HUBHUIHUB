import copy
import datetime as dt
import unittest

import tasks
from test_tasks import TASK, NOW


class TaskMoveTests(unittest.TestCase):
    def state(self, **fields):
        return {'tasks': [dict(copy.deepcopy(TASK), **fields)], 'done': {}}

    def test_interval_anchor_and_validation(self):
        state = self.state(repeat='interval', interval=3)
        tasks.validate(state)
        for offset, expected in [(0, 1), (1, 0), (2, 0), (3, 1), (6, 1)]:
            self.assertEqual(len(list(tasks.due(state, 0, NOW+offset*86400))), expected)
        for invalid in [0, -1, 366, True, 2.5, '3', None]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                tasks.validate(self.state(repeat='interval', interval=invalid))
        task = self.state(repeat='interval', interval=3, date='2028-02-28')['tasks'][0]
        self.assertTrue(tasks.occurs(task, dt.date(2028, 3, 2)))
        self.assertFalse(tasks.occurs(task, dt.date(2028, 3, 1)))

    def test_move_collision_completion_and_original_time(self):
        state = self.state(repeat='daily', shifts={'2026-09-30': {'date': '2026-10-01', 'time': '09:00'}})
        tasks.validate(state)
        self.assertEqual(list(tasks.due(state, 0, NOW)), [])
        due = list(tasks.due(state, 0, NOW+86400))
        self.assertEqual(len(due), 2)
        self.assertNotEqual(due[0][0], due[1][0])
        state['done']['test-task|2026-09-30'] = '2026-10-01T05:00:00Z'
        remaining = list(tasks.due(state, 0, NOW+86400))
        self.assertEqual(len(remaining), 1)
        self.assertIn('|2026-10-01|', remaining[0][0])

    def test_far_move_midnight_and_subscription_time(self):
        state = self.state(shifts={'2026-09-30': {'date': '2026-11-15', 'time': '23:59'}})
        tasks.validate(state)
        now = dt.datetime(2026, 11, 15, 20, 1, tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(len(list(tasks.due(state, NOW, now))), 1)
        self.assertEqual(list(tasks.due(state, now, now)), [])
        state['tasks'][0]['shifts']['2026-09-30'] = {'date': '2026-09-29', 'time': '09:00'}
        self.assertEqual(len(list(tasks.due(state, 0, NOW-86400))), 1)

    def test_shift_validation_and_dst(self):
        for shifts in [[], {'2026-10-01': {'date': '2026-10-02', 'time': '09:00'}},
                       {'2026-09-30': {'date': '2026-02-30', 'time': '09:00'}},
                       {'2026-09-30': {'date': '2026-10-01', 'time': '24:00'}},
                       {'2026-09-30': {'date': '2026-10-01', 'time': '09:00', 'extra': 1}}]:
            with self.subTest(shifts=shifts), self.assertRaises(ValueError):
                tasks.validate(self.state(shifts=shifts))
        with self.assertRaises(ValueError):
            tasks.validate(self.state(timezone='America/New_York', shifts={'2026-09-30': {'date': '2026-03-08', 'time': '02:30'}}))


if __name__ == '__main__':
    unittest.main()
