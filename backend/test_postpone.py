import copy
import datetime as dt
import importlib
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo
from schedule_logic import schedule_entries,shifted_moment

class PostponeTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        os.environ['DATA_DIR']=self.directory.name
        import push_system,server
        self.push=importlib.reload(push_system);self.server=importlib.reload(server);self.server.initialize()
        self.med=dict(id='m',name='Test',dose='1',note='',start='2026-09-28',end='2026-09-30',days=list(range(7)),times=['09:00','20:00'],shifts=[dict(**{'from':'2026-09-29T09:00'},minutes=1440,at='2026-09-29T06:00:00Z')])
        self.state=dict(meds=[self.med],taken={'2026-09-29|m|09:00':'2026-09-29T05:00:00Z'},skipped={},fixed={})

    def test_partial_course_and_fixed_outcomes(self):
        self.assertEqual(schedule_entries(self.state,'2026-09-29'),[('2026-09-29|m|09:00','2026-09-29T09:00')])
        self.assertEqual(schedule_entries(self.state,'2026-09-30'),[('2026-09-29|m|20:00','2026-09-30T20:00')])
        self.assertEqual(len(schedule_entries(self.state,'2026-10-01')),2)
        self.state['skipped']['2026-09-29|m|20:00']='2026-09-30T16:00:00Z'
        self.state['fixed']['2026-09-29|m|20:00']='2026-09-30T20:00'
        self.med['shifts'].append(dict(**{'from':'2026-09-29T20:00'},minutes=300,at='2026-09-30T16:01:00Z'))
        self.assertEqual(schedule_entries(self.state,'2026-09-30')[0][1],'2026-09-30T20:00')
        self.assertEqual(shifted_moment(self.med,'2026-09-30T20:00'),'2026-10-02T01:00')
        self.server.validate_state(self.state)

    def test_notifications_move_and_skip(self):
        old=dt.datetime(2026,9,29,20,tzinfo=ZoneInfo('Asia/Dubai')).timestamp()
        new=old+86400
        self.assertEqual(list(self.push.due(self.state,'Asia/Dubai',0,old)),[])
        self.assertEqual(list(self.push.due(self.state,'Asia/Dubai',0,new)),[('2026-09-29|m|20:00',new)])
        self.state['skipped']['2026-09-29|m|20:00']='2026-09-30T16:00:00Z'
        self.state['fixed']['2026-09-29|m|20:00']='2026-09-30T20:00'
        self.assertEqual(list(self.push.due(self.state,'Asia/Dubai',0,new)),[])

    def test_delivery_once_per_new_time(self):
        self.med['shifts']=[];self.state['taken']={}
        original=dt.datetime(2026,9,29,9,tzinfo=ZoneInfo('Asia/Dubai')).timestamp()
        with self.push.connect() as c:
            c.execute('UPDATE state SET body=?',(json.dumps(self.state),))
            c.execute('INSERT INTO push_subscriptions(id,body,zone,created) VALUES(?,?,?,?)',('test','{}','Asia/Dubai',0))
        calls=[]
        def sender(*args,**kwargs):calls.append(args);return 'sent'
        self.push.run_once(original,sender);self.push.run_once(original+20,sender)
        self.med['shifts']=[dict(**{'from':'2026-09-29T09:00'},minutes=60,at='2026-09-29T05:01:00Z')]
        with self.push.connect() as c:c.execute('UPDATE state SET body=?',(json.dumps(self.state),))
        self.push.run_once(original+3600,sender);self.push.run_once(original+3620,sender)
        self.assertEqual(len(calls),2)
        self.assertNotEqual(calls[0][1]['tag'],calls[1][1]['tag'])

    def test_concurrent_shift_cancels_old_delivery(self):
        key='2026-09-29|m|09:00';original=dt.datetime(2026,9,29,9,tzinfo=ZoneInfo('Asia/Dubai')).timestamp()
        with self.push.connect() as c:
            c.execute('UPDATE state SET body=?',(json.dumps(self.state),))
            c.execute('INSERT INTO push_subscriptions(id,body,zone,created) VALUES(?,?,?,?)',('test','{}','Asia/Dubai',0))
        calls=[]
        with patch.object(self.push,'due',side_effect=[iter([(key,original)]),iter([(key,original+60)])]):
            self.push.run_once(original+120,lambda *a,**k:calls.append(a))
        self.assertEqual(calls,[])

    def test_dst_keeps_local_clock_and_cycles(self):
        self.med.update(start='2026-10-24',end='2026-10-28',times=['09:00'],cycle={'on':1,'off':1},shifts=[dict(**{'from':'2026-10-24T09:00'},minutes=1440,at='2026-10-24T06:00:00Z')])
        self.state['taken']={}
        moment=dt.datetime(2026,10,25,9,tzinfo=ZoneInfo('Europe/Berlin')).timestamp()
        self.assertEqual(list(self.push.due(self.state,'Europe/Berlin',0,moment)),[('2026-10-24|m|09:00',moment)])
        self.assertEqual(schedule_entries(self.state,'2026-10-26'),[])
        self.assertEqual(len(schedule_entries(self.state,'2026-10-29')),1)

    def test_invalid_changes_rejected(self):
        self.server.validate_state(self.state)
        for minutes in (0,-1,True,525601):
            bad=copy.deepcopy(self.state);bad['meds'][0]['shifts'][0]['minutes']=minutes
            with self.assertRaises(ValueError):self.server.validate_state(bad)
        bad=copy.deepcopy(self.state);bad['skipped']=dict(bad['taken'])
        with self.assertRaises(ValueError):self.server.validate_state(bad)
        bad=copy.deepcopy(self.state);bad['fixed']['2026-09-30|m|09:00']='2026-09-30T09:00'
        with self.assertRaises(ValueError):self.server.validate_state(bad)

if __name__=='__main__':unittest.main()
