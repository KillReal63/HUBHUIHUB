import copy
import datetime as dt
import unittest
from zoneinfo import ZoneInfo
import server
import push_system

class CycleTests(unittest.TestCase):
    def med(self):
        return dict(id='cycle', name='Synthetic', dose='1', note='', start='2026-09-18', end='', days=[0], times=['09:00','20:00'], cycle={'on':2,'off':3})

    def test_validation(self):
        med=self.med()
        server.validate_state({'meds':[med], 'taken':{}})
        for cycle in [None, {}, {'on':1}, {'on':0,'off':1}, {'on':1,'off':-1}, {'on':True,'off':1}, {'on':1.5,'off':2}, {'on':'2','off':1}, {'on':366,'off':1}, {'on':1,'off':1,'extra':1}]:
            with self.subTest(cycle=cycle), self.assertRaises(ValueError):
                server.validate_state({'meds':[{**med, 'cycle':cycle}], 'taken':{}})
        del med['cycle']
        server.validate_state({'meds':[med], 'taken':{}})

    def test_push_calendar_cycles(self):
        for zone in ['Asia/Dubai','America/New_York','Europe/Berlin']:
            for start in ['2026-09-18','2024-02-28','2026-03-07','2026-10-24','2026-10-31','2026-12-31']:
                med=self.med();med['start']=start
                for n in range(-1,21):
                    date=dt.date.fromisoformat(start)+dt.timedelta(days=n)
                    for hour in [9,20]:
                        now=dt.datetime.combine(date,dt.time(hour,0,20),ZoneInfo(zone)).timestamp()
                        state={'meds':[med],'taken':{}}
                        result=list(push_system.due(state,zone,0,now))
                        self.assertEqual(bool(result),n>=0 and n%5<2,(zone,start,n,hour))
                        if result:
                            state['taken'][result[0][0]]='2026-09-18T00:00:00Z'
                            self.assertFalse(list(push_system.due(state,zone,0,now)))
                med['end']=start
                now=dt.datetime.combine(dt.date.fromisoformat(start)+dt.timedelta(days=5),dt.time(9,0,20),ZoneInfo(zone)).timestamp()
                self.assertFalse(list(push_system.due({'meds':[med],'taken':{}},zone,0,now)))

if __name__=='__main__':unittest.main()
