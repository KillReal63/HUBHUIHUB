import copy
import datetime as dt
import json
import sqlite3
import unittest
from unittest.mock import patch

import tasks
from test_tasks import TASK, NOW


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:')
        tasks.initialize(self.c)
        self.c.executescript('''
            CREATE TABLE push_subscriptions(id TEXT PRIMARY KEY,body TEXT,created REAL);
            CREATE TABLE push_deliveries(subscription TEXT,dose TEXT,status TEXT,attempts INTEGER,next_try REAL,created REAL,PRIMARY KEY(subscription,dose));
        ''')
        self.c.execute('INSERT INTO push_subscriptions VALUES(?,?,?)',('device','{}',0))
        self.c.commit()
        self.state={'tasks':[dict(copy.deepcopy(TASK),reminderMinutes=30)],'done':{}}
        self.put()

    def tearDown(self):self.c.close()

    def put(self):
        tasks.validate(self.state)
        self.c.execute('UPDATE tasks_state SET body=? WHERE id=1',(json.dumps(self.state),))
        self.c.commit()

    def test_validation_defaults_and_old_client(self):
        for invalid in [True,False,10.0,1,20,-1,90,721,'30',None]:
            value=copy.deepcopy(self.state);value['tasks'][0]['reminderMinutes']=invalid
            with self.subTest(value=invalid),self.assertRaises(ValueError):tasks.validate(value)
        legacy=copy.deepcopy(self.state);del legacy['tasks'][0]['reminderMinutes']
        self.assertEqual(list(tasks.due(legacy,0,NOW+1800)),[])
        self.assertEqual(tasks.save(self.c,{'version':0,'state':legacy})[0],200)
        self.assertEqual(tasks.read(self.c)['state']['tasks'][0]['reminderMinutes'],30)
        legacy['tasks'][0]['reminderMinutes']=0
        self.assertEqual(tasks.save(self.c,{'version':1,'state':legacy})[0],200)
        self.assertEqual(list(tasks.due(tasks.read(self.c)['state'],0,NOW+1800)),[])

    def test_slots_window_limit_and_subscription_age(self):
        for minutes in [10,30,60]:
            self.state['tasks'][0]['reminderMinutes']=minutes
            for index in range(4):
                offset=index*minutes*60
                due=list(tasks.due(self.state,0,NOW+offset))
                self.assertEqual(len(due),1)
                self.assertEqual(due[0][1],NOW-20+offset)
                self.assertEqual('|reminder|' in due[0][0],index>0)
                self.assertEqual(list(tasks.due(self.state,0,NOW-20+offset+300)),[])
            self.assertEqual(list(tasks.due(self.state,0,NOW+4*minutes*60)),[])
            self.assertEqual(list(tasks.due(self.state,NOW,NOW+minutes*60)),[])
        # No catch-up burst when the worker resumes after a missed slot.
        self.assertEqual(len(list(tasks.due(self.state,0,NOW+3*3600))),1)

    def test_midnight_dst_and_moved_occurrence(self):
        task=self.state['tasks'][0]
        task.update(time='23:50',reminderMinutes=60)
        midnight=dt.datetime(2026,10,1,2,50,tzinfo=dt.timezone(dt.timedelta(hours=4))).timestamp()
        self.assertEqual(len(list(tasks.due(self.state,0,midnight))),1)
        task.update(date='2026-03-08',time='01:50',timezone='America/New_York',reminderMinutes=10)
        after_gap=dt.datetime(2026,3,8,7,0,tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(list(tasks.due(self.state,0,after_gap))[0][1],after_gap)
        task.update(date='2026-11-01',reminderMinutes=30)
        after_fold=dt.datetime(2026,11,1,6,20,tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(len(list(tasks.due(self.state,0,after_fold))),1)
        task.update(**TASK,reminderMinutes=30,shifts={'2026-09-30':{'date':'2026-10-10','time':'09:00'}})
        self.assertEqual(list(tasks.due(self.state,0,NOW+1800)),[])
        self.assertEqual(len(list(tasks.due(self.state,0,NOW+10*86400+1800))),1)
        self.state['done']['test-task|2026-09-30']='2026-10-10T05:01:00Z'
        self.assertEqual(list(tasks.due(self.state,0,NOW+10*86400+1800)),[])

    def test_delivery_is_deduplicated_on_each_device(self):
        self.c.execute('INSERT INTO push_subscriptions VALUES(?,?,?)',('other','{}',0));self.c.commit()
        calls=[]
        def sender(sub,payload,**kw):calls.append((payload,kw));return 'sent'
        for index in range(4):
            for tick in [0,20,46]:tasks.deliver(self.c,NOW+index*1800+tick,sender)
        self.assertEqual(len(calls),8)
        self.assertEqual(len({payload['tag'] for payload,_ in calls}),4)
        for payload,kw in calls:
            self.assertNotIn(TASK['title'],payload['body']);self.assertEqual(kw['ttl'],280)
        tasks.deliver(self.c,NOW+7200,sender);self.assertEqual(len(calls),8)

    def test_retry_bound_and_setting_change_preserves_sent_slots(self):
        calls=[]
        def retry(*args,**kw):calls.append(1);return 'retry'
        for tick in [0,20,46,92,140]:tasks.deliver(self.c,NOW+1800+tick,retry)
        self.assertEqual(len(calls),3)
        # A previously sent slot must not be sent again after interval changes.
        self.c.execute("UPDATE push_deliveries SET status='sent'");self.c.commit()
        self.state['tasks'][0]['reminderMinutes']=60;self.put()
        tasks.deliver(self.c,NOW+3600,retry);self.assertEqual(len(calls),3)

    def test_complete_delete_disable_and_move_cancel_pending(self):
        for change in ['complete','delete','disable','move']:
            with self.subTest(change=change):
                original=tasks.read
                count=0;calls=[]
                def changed(c):
                    nonlocal count
                    count+=1;value=original(c)
                    if count>=2:
                        state=value['state']
                        if change=='complete':state['done']['test-task|2026-09-30']='2026-09-30T05:00:00Z'
                        elif change=='delete':state['tasks']=[]
                        elif change=='disable':state['tasks'][0]['reminderMinutes']=0
                        else:state['tasks'][0]['shifts']={'2026-09-30':{'date':'2026-10-01','time':'09:00'}}
                    return value
                self.c.execute('DELETE FROM push_deliveries');self.c.commit()
                with patch.object(tasks,'read',changed):tasks.deliver(self.c,NOW+1800,lambda *a,**kw:calls.append(a))
                self.assertEqual(calls,[])
                self.assertEqual(self.c.execute('SELECT status FROM push_deliveries').fetchone()[0],'cancelled')

    def test_following_occurrence_keeps_its_reminders(self):
        self.state['tasks'][0]['repeat']='daily'
        self.state['done']['test-task|2026-09-30']='2026-09-30T05:00:00Z'
        self.assertEqual(list(tasks.due(self.state,0,NOW+1800)),[])
        self.assertEqual(len(list(tasks.due(self.state,0,NOW+86400+1800))),1)

    def test_custom_twelve_hour_interval(self):
        self.state['tasks'][0]['reminderMinutes']=720
        for index in range(4):
            due=list(tasks.due(self.state,0,NOW+index*720*60))
            self.assertEqual(len(due),1)
            self.assertEqual('|reminder|' in due[0][0],index>0)


if __name__=='__main__':unittest.main()
