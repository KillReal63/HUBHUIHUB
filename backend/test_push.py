import base64
import copy
import datetime as dt
import importlib
import json
import os
import tempfile
import unittest
from unittest.mock import patch

class PushTests(unittest.TestCase):
    def test_schedule_and_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['DATA_DIR']=directory
            import push_system as p
            import server
            importlib.reload(p);importlib.reload(server);server.initialize()
            med={'id':'test','name':'Test','dose':'1','note':'','start':'2026-09-17','end':'2026-09-17','days':[4],'times':['09:00']}
            state={'meds':[med],'taken':{}}
            now=dt.datetime(2026,9,17,5,0,20,tzinfo=dt.timezone.utc).timestamp()
            key='2026-09-17|test|09:00'
            self.assertEqual(list(p.due(state,'Asia/Dubai',now-100,now)),[(key,now-20)])
            self.assertEqual(list(p.due(state,'UTC',now-100,now)),[])
            self.assertEqual(list(p.due(state,'Asia/Dubai',now-100,now+301)),[])
            self.assertEqual(list(p.due(state,'Asia/Dubai',now,now)),[])
            taken=copy.deepcopy(state);taken['taken'][key]='2026-09-17T05:00:00Z'
            self.assertEqual(list(p.due(taken,'Asia/Dubai',0,now)),[])
            offday=copy.deepcopy(state);offday['meds'][0]['days']=[1]
            self.assertEqual(list(p.due(offday,'Asia/Dubai',0,now)),[])
            sub={'endpoint':'https://web.push.apple.com/fake-test-only','keys':{'auth':base64.urlsafe_b64encode(b'a'*16).rstrip(b'=').decode(),'p256dh':p.public_key()}}
            self.assertEqual(p.validate_subscription(sub),sub)
            bad=copy.deepcopy(sub);bad['endpoint']='https://127.0.0.1/secret'
            with self.assertRaises(ValueError):p.validate_subscription(bad)
            sid=p.identity(sub['endpoint'])
            with p.connect() as c:
                c.execute('UPDATE state SET body=?',(json.dumps(state),))
                c.execute('INSERT INTO push_subscriptions(id,body,zone,created) VALUES(?,?,?,?)',(sid,json.dumps(sub),'Asia/Dubai',now-100))
            calls=[]
            def sender(*args,**kwargs):calls.append((args,kwargs));return 'sent'
            p.run_once(now,sender);p.run_once(now+20,sender)
            self.assertEqual(len(calls),1)
            p.initialize();p.run_once(now+40,sender)
            self.assertEqual(len(calls),1)
            self.assertEqual(calls[0][1]['ttl'],280)
            # Verify actual payload encryption/signing without contacting a push service.
            class Response:
                status_code=201
                text=''
                headers={}
            with patch('requests.post',return_value=Response()) as post:
                self.assertEqual(p.dispatch(sub,{'title':'Test','body':'Synthetic test'}),'sent')
                self.assertEqual(post.call_count,1)
            with p.connect() as c:
                c.execute('DELETE FROM push_deliveries')
            retries=[]
            def retry(*a,**k):retries.append(1);return 'retry'
            p.run_once(now,retry);p.run_once(now+20,retry);p.run_once(now+46,retry);p.run_once(now+92,retry);p.run_once(now+140,retry)
            self.assertEqual(len(retries),3)
            with p.connect() as c:c.execute('DELETE FROM push_deliveries')
            p.run_once(now,lambda *a,**k:'expired')
            with p.connect() as c:self.assertEqual(c.execute('SELECT count(*) FROM push_subscriptions').fetchone()[0],0)

if __name__=='__main__':unittest.main()
