import copy
import unittest
import uuid

import wellness as w
import data_portability as portability
import test_wellness as fixtures
NOW = fixtures.NOW


def session(finished=False):
    return {'id':'session-one','dayId':'deleted-day','name':'Спина','date':'2026-10-19',
            'timezone':'Asia/Dubai','startedAt':'2026-10-19T08:00:00Z',
            'finishedAt':'2026-10-19T09:00:00Z' if finished else None,
            'exercises':[{'id':'deleted-exercise','name':'Тяга','group':'back','note':'Снимок',
                          'sets':[{'reps':12,'weight':20,'done':True},{'reps':10,'weight':'','done':False}]}]}


class GymHistory(unittest.TestCase):
    setUp = fixtures.Wellness.setUp
    tearDown = fixtures.Wellness.tearDown
    call = fixtures.Wellness.call

    def state(self, finished=False):
        return {**copy.deepcopy(w.EMPTY_GYM), 'sessions':[session(finished)]}

    def test_history_survives_old_client_and_program_deletion(self):
        self.call('gym',state=self.state(True))
        old = {k:v for k,v in copy.deepcopy(w.EMPTY_GYM).items() if k != 'sessions'}
        _, result = self.call('gym',state=old)
        self.assertEqual(result['state']['sessions'],[session(True)])

    def test_completed_snapshot_cannot_be_rewritten(self):
        self.call('gym',state=self.state(True))
        changed = self.state(True); changed['sessions'][0]['exercises'][0]['sets'][0]['weight']=90
        with self.assertRaises(ValueError): self.call('gym',state=changed)
        self.assertEqual(w.read(self.c,'gym')['state']['sessions'],[session(True)])

    def test_progress_completion_conflict_and_retry(self):
        self.call('gym',state=self.state())
        version = w.read(self.c,'gym')['version']
        body={'state':self.state(True),'version':version,'operation':str(uuid.uuid4())}
        with self.c: code,_ = w.save(self.c,'gym',body,NOW)
        self.assertEqual(code,200)
        with self.c: code,_ = w.save(self.c,'gym',body,NOW)
        self.assertEqual(code,200)
        self.assertEqual(len(w.read(self.c,'gym')['state']['sessions']),1)
        body['operation']=str(uuid.uuid4())
        with self.c: code,_ = w.save(self.c,'gym',body,NOW)
        self.assertEqual(code,409)

    def test_validation_and_atomic_rejection(self):
        invalid=[]
        for change in [lambda s:s.update(finishedAt='2026-10-18T09:00:00Z'),
                       lambda s:s.update(timezone='Invalid/Zone'),
                       lambda s:s.update(date='2026-10-20'),
                       lambda s:s.update(startedAt=None),
                       lambda s:s['exercises'][0]['sets'][0].update(reps=1.5),
                       lambda s:s['exercises'][0]['sets'][0].update(weight=-1),
                       lambda s:s['exercises'][0]['sets'][0].update(reps=0)]:
            state=self.state();change(state['sessions'][0]);invalid.append(state)
        state=self.state();second=session();second['id']='session-two';state['sessions'].append(second);invalid.append(state)
        for state in invalid:
            with self.subTest(state=state),self.assertRaises(ValueError): self.call('gym',state=state)
        self.assertEqual(w.read(self.c,'gym')['version'],0)

    def test_reset_and_backup_roundtrip(self):
        self.call('gym',state=self.state(True))
        backup=portability.snapshot(self.c)
        portability.validate(backup,lambda s:s)
        self.assertEqual(portability.summary(backup)['Тренировочные сессии'],1)
        self.assertEqual(backup['modules']['gym']['state']['sessions'],[session(True)])
        self.call('gym',command='reset')
        self.assertEqual(w.read(self.c,'gym')['state']['sessions'],[])
        preview={'backup':backup,'action':'preview'}
        # Restoration uses the actual portability API and version checks.
        with self.c: code,result=portability.process(self.c,preview,lambda s:s)
        self.assertEqual(code,200)
        with self.c: code,_=portability.process(self.c,{'backup':backup,'action':'restore','digest':result['digest'],'versions':result['versions'],'operation':str(uuid.uuid4())},lambda s:s)
        self.assertEqual(code,200)
        self.assertEqual(w.read(self.c,'gym')['state']['sessions'],[session(True)])


if __name__ == '__main__': unittest.main()
