import datetime as dt
import unittest
from zoneinfo import ZoneInfo

import push_system
import server


class MedicationReminderTests(unittest.TestCase):
    def med(self, minutes=120):
        return {'id':'med-1','name':'Synthetic','dose':'1','note':'','category':'pill','meal':'any',
                'start':'2026-10-10','end':'','days':[0,1,2,3,4,5,6],'times':['09:00'],
                'reminderMinutes':minutes}

    def test_validation_accepts_custom_hours(self):
        server.validate_state({'meds':[self.med(720)],'taken':{}})
        for invalid in (1,61,90,721,False,'120'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                server.validate_state({'meds':[self.med(invalid)],'taken':{}})

    def test_three_followups_and_completion_cancels(self):
        zone='Asia/Dubai';state={'meds':[self.med(120)],'taken':{}}
        base=dt.datetime(2026,10,10,9,0,tzinfo=ZoneInfo(zone)).timestamp()
        for index in range(4):
            due=list(push_system.due(state,zone,0,base+index*7200+20))
            self.assertEqual(len(due),1)
            if index:self.assertTrue(due[0][0].endswith('|reminder|'+str(index)))
        state['taken']['2026-10-10|med-1|09:00']='2026-10-10T09:01:00+04:00'
        self.assertFalse(list(push_system.due(state,zone,0,base+7200+20)))

    def test_new_subscription_does_not_receive_old_followup(self):
        zone='Asia/Dubai';state={'meds':[self.med(120)],'taken':{}}
        base=dt.datetime(2026,10,10,9,0,tzinfo=ZoneInfo(zone)).timestamp()
        self.assertFalse(list(push_system.due(state,zone,base+60,base+7200+20)))


if __name__=='__main__':unittest.main()
