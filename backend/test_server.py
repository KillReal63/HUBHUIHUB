from contextlib import closing
import copy
import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error

class Integration(unittest.TestCase):
    def test_full_flow(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['DATA_DIR']=directory
            import server
            importlib.reload(server.push_system)
            importlib.reload(server)
            server.initialize()
            http=server.ThreadingHTTPServer(('127.0.0.1',0),server.API)
            threading.Thread(target=http.serve_forever,daemon=True).start()
            base='http://127.0.0.1:'+str(http.server_port)
            cookie=''
            def request(path,body=None,origin=server.ORIGIN,authenticated=True):
                nonlocal cookie
                headers={'Origin':origin,'Content-Type':'application/json'}
                if authenticated: headers['Cookie']=cookie
                req=urllib.request.Request(base+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
                try: response=urllib.request.urlopen(req)
                except urllib.error.HTTPError as e: response=e
                if response.headers.get('Set-Cookie'): cookie=response.headers['Set-Cookie'].split(';')[0]
                return response.status,json.loads(response.read())
            try:
                self.assertEqual(request('state')[0],401)
                self.assertEqual(request('auth-check')[0],401)
                self.assertTrue(request('session')[1]['setupRequired'])
                password='test-only-password-strong'
                self.assertEqual(request('setup',{'password':password,'token':'wrong'})[0],403)
                token=(Path(directory)/'setup-token').read_text()
                self.assertEqual(request('setup',{'password':password,'token':token},origin='https://evil.example')[0],403)
                self.assertEqual(request('setup',{'password':password,'token':token})[0],200)
                self.assertFalse((Path(directory)/'setup-token').exists())
                self.assertEqual(request('auth-check')[0],200)
                self.assertEqual(request('auth-check',authenticated=False)[0],401)
                self.assertEqual(request('setup',{'password':password,'token':token})[0],409)
                self.assertEqual(request('state',authenticated=False)[0],401)
                med={'id':'test-id','name':'Тест','dose':'Тест','note':'','days':[1,2,3,4,5,6,0],'times':['09:00'],'start':'2026-09-17','end':''}
                data={'meds':[med],'taken':{'2026-09-17|test-id|09:00':'2026-09-17T05:00:00.000Z'}}
                self.assertEqual(request('state',{'state':data,'version':0})[0],200)
                self.assertEqual(request('state',{'state':data,'version':0})[0],409)
                invalid=copy.deepcopy(data);invalid['meds'][0]['times']=['99:99']
                self.assertEqual(request('state',{'state':invalid,'version':1})[0],400)
                self.assertEqual(request('state')[1]['state'],data)
                data['meds'][0]['cycle']={'on':2,'off':3}
                self.assertEqual(request('state',{'state':data,'version':1})[0],200)
                self.assertEqual(request('state')[1]['state'],data)
                for category in ['pill','ointment','supplement','action','spray','drops','injection']:
                    data['meds'][0]['category']=category
                    data['meds'][0]['dose']='' if category in ('action','ointment') else '1'
                    version=request('state')[1]['version']
                    self.assertEqual(request('state',{'state':data,'version':version})[0],200)
                    self.assertEqual(request('state')[1]['state'],data)
                data['meds'][0]['times']=[]
                self.assertEqual(request('state',{'state':data,'version':request('state')[1]['version']})[0],200)
                self.assertEqual(request('state')[1]['state'],data)
                data['meds'][0]['times']=['09:00']
                data['meds'][0].pop('cycle')
                data['meds'][0].update(meal='fasting',durationDays=3,end='2026-09-19')
                self.assertEqual(request('state',{'state':data,'version':request('state')[1]['version']})[0],200)
                self.assertEqual(request('state')[1]['state'],data)
                for fields in [{'meal':'bad'},{'durationDays':0},{'durationDays':True},{'end':'2026-09-20'},{'days':[1]}]:
                    invalid=copy.deepcopy(data);invalid['meds'][0].update(fields)
                    self.assertEqual(request('state',{'state':invalid,'version':request('state')[1]['version']})[0],400)
                for category in ['unknown', None, [], 1]:
                    invalid=copy.deepcopy(data);invalid['meds'][0]['category']=category
                    self.assertEqual(request('state',{'state':invalid,'version':request('state')[1]['version']})[0],400)
                data['skipped']={'2026-09-18|test-id|09:00':'2026-09-18T06:00:00Z'}
                data['fixed']={'2026-09-18|test-id|09:00':'2026-09-18T09:00'}
                data['meds'][0]['shifts']=[{'from':'2026-09-19T09:00','minutes':60,'at':'2026-09-18T06:01:00Z'}]
                version=request('state')[1]['version']
                self.assertEqual(request('state',{'state':data,'version':version})[0],200)
                outdated=copy.deepcopy(data);outdated.pop('skipped');outdated.pop('fixed')
                self.assertEqual(request('state',{'state':outdated,'version':version+1})[0],409)
                outdated=copy.deepcopy(data);outdated['meds'][0].pop('shifts')
                self.assertEqual(request('state',{'state':outdated,'version':version+1})[0],409)
                server.initialize()
                self.assertEqual(request('state')[1]['state'],data)
                subprocess.run([sys.executable,str(Path(__file__).with_name('backup.py'))],check=True)
                backup=next((Path(directory)/'backups').glob('*.sqlite3'))
                with closing(sqlite3.connect(backup)) as c:
                    self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                    self.assertEqual(json.loads(c.execute('SELECT body FROM state').fetchone()[0]),data)
                self.assertEqual(request('logout',{})[0],200)
                self.assertEqual(request('state')[0],401)
                self.assertEqual(request('login',{'password':'wrong-password-123'})[0],401)
                self.assertEqual(request('login',{'password':password})[0],200)
                self.assertEqual(request('state')[1]['state'],data)
                for _ in range(10):request('login',{'password':'wrong-password-123'})
                self.assertEqual(request('login',{'password':password})[0],429)
            finally:
                http.shutdown();http.server_close()

if __name__=='__main__':unittest.main()
