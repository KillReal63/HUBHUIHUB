import copy
from contextlib import closing
import datetime as dt
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
import uuid

import wellness as w
import tasks
import data_portability as portability

NOW = dt.datetime(2026,10,19,8,tzinfo=dt.timezone.utc)


class Wellness(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.path=Path(self.temp.name)/'test.sqlite3'
        self.c=sqlite3.connect(self.path)
        self.c.execute('CREATE TABLE state(id INTEGER PRIMARY KEY,version INTEGER,body TEXT)')
        self.c.execute('INSERT INTO state VALUES(1,0,?)',(json.dumps({'meds':[],'taken':{}}),))
        tasks.initialize(self.c);w.initialize(self.c);self.c.commit()

    def tearDown(self):
        self.c.close();self.temp.cleanup()

    def call(self,module='food',**kwargs):
        body={'operation':str(uuid.uuid4()),'version':w.read(self.c,module)['version'],**kwargs}
        with self.c: return w.save(self.c,module,body,NOW)

    def stock(self,quantity=10,expiry='2026-11-01'):
        code,result=self.call(command='stock',value={'name':'Яйца','quantity':quantity,'unit':'шт','days':5,'date':'2026-10-19','expiry':expiry,'timezone':'Asia/Dubai'})
        self.assertEqual(code,200);return result['state']['stocks'][-1]['id']

    def enable(self,p,**extra):
        rule={'enabled':True,'mode':'threshold','threshold':2,'target':10,'leadDays':1,'time':'18:00','timezone':'Asia/Dubai',**extra}
        self.assertEqual(self.call(command='rule',product=p,value=rule)[0],200)

    def consume(self,p,quantity):
        s=w.read(self.c,'food')['state'];s['meals'].append({'id':str(uuid.uuid4()),'name':'Порция','kind':'Завтрак','date':'2026-10-19','time':'12:00','note':'','kcal':None,'consumed':{'stockId':p,'amount':quantity,'unit':'шт'}})
        return self.call(state=s)

    def replenish(self,p,quantity=10,expiry='2026-11-05'):
        return self.call(command='stock',product=p,value={'name':'Яйца','quantity':quantity,'unit':'шт','days':5,'date':'2026-10-19','expiry':expiry,'timezone':'Asia/Dubai'})

    def active(self):
        s=tasks.read(self.c)['state'];return [t for t in s['tasks'] if t['id']+'|'+t['date'] not in s['done']]

    def test_manual_shopping_persistence_retry_and_isolation(self):
        before_tasks=tasks.read(self.c)
        body={'operation':str(uuid.uuid4()),'version':0,'command':'shopping-add','name':' Губки '}
        with self.c: code,result=w.save(self.c,'food',body,NOW)
        self.assertEqual(code,200)
        item=result['state']['manualShopping'][0]
        self.assertEqual(item['name'],'Губки')
        with self.c: _,retry=w.save(self.c,'food',body,NOW)
        self.assertEqual(len(retry['state']['manualShopping']),1)
        self.assertEqual(self.call(command='shopping-check',item=item['id'],done=True)[0],200)
        self.call(command='shopping-add',name='Тряпки')
        legacy=w.read(self.c,'food')['state'];del legacy['manualShopping']
        self.assertEqual(self.call(state=legacy)[0],200)
        self.assertEqual(len(w.read(self.c,'food')['state']['manualShopping']),2)
        backup=portability.snapshot(self.c);portability.validate(backup,lambda s:s)
        self.assertEqual(len(backup['modules']['food']['state']['manualShopping']),2)
        _,result=self.call(command='shopping-finish')
        self.assertEqual(result['state']['manualShopping'],[])
        trip=result['state']['shoppingTrips'][0]
        self.assertEqual([(x['name'],x['bought']) for x in trip['items']],[('Губки',True),('Тряпки',False)])
        self.call(command='shopping-repeat',trip=trip['id'],item=trip['items'][0]['id'])
        _,result=self.call(command='shopping-repeat',trip=trip['id'])
        self.assertEqual([x['name'] for x in result['state']['manualShopping']],['Губки','Тряпки'])
        self.assertEqual(len(result['state']['shoppingTrips']),1)
        self.call(command='shopping-history-clear')
        for item in list(w.read(self.c,'food')['state']['manualShopping']):
            self.call(command='shopping-delete',item=item['id'])
        self.assertEqual(w.read(self.c,'food')['state']['manualShopping'],[])
        self.assertEqual(w.read(self.c,'food')['state']['shoppingTrips'],[])
        self.assertEqual(tasks.read(self.c),before_tasks)
        self.assertEqual(w.read(self.c,'food')['state']['stocks'],[])

    def test_manual_shopping_validation_conflict_and_reset(self):
        for name in ['', '  ', 'a'*121, None]:
            with self.assertRaises(ValueError):self.call(command='shopping-add',name=name)
        self.call(command='shopping-add',name='Пакеты')
        before=w.read(self.c,'food')
        with self.c:
            code,_=w.save(self.c,'food',{'operation':str(uuid.uuid4()),'version':0,'command':'shopping-clear'},NOW)
        self.assertEqual(code,409);self.assertEqual(w.read(self.c,'food'),before)
        item=before['state']['manualShopping'][0]
        with self.assertRaises(ValueError):self.call(command='shopping-check',item=item['id'],done='yes')
        self.call(command='reset')
        self.assertEqual([x['name'] for x in w.read(self.c,'food')['state']['manualShopping']],['Пакеты'])
        self.call(command='shopping-reset')
        self.assertEqual(w.read(self.c,'food')['state']['manualShopping'],[])
        self.assertEqual(w.read(self.c,'food')['state']['shoppingTrips'],[])

    def test_food_reset_closes_purchase_and_preserves_other_modules(self):
        product=self.stock(quantity=1);self.enable(product)
        purchase=self.active()[0]
        before_gym=w.read(self.c,'gym')
        task_state=tasks.read(self.c)['state']
        ordinary={**purchase,'id':str(uuid.uuid4()),'title':'Обычное дело'}
        task_state['tasks'].append(ordinary)
        with self.c:
            self.c.execute('UPDATE tasks_state SET body=? WHERE id=1',(json.dumps(task_state),))
        version=w.read(self.c,'food')['version']
        body={'operation':str(uuid.uuid4()),'version':version,'command':'reset'}
        with self.c: code,result=w.save(self.c,'food',body,NOW)
        self.assertEqual(code,200);self.assertEqual(result['state'],w.EMPTY_FOOD)
        self.assertEqual(result['shopping'],[])
        self.assertEqual([t['id'] for t in self.active()],[ordinary['id']])
        self.assertEqual(w.read(self.c,'gym'),before_gym)
        with self.c: repeated=w.save(self.c,'food',body,NOW)
        self.assertEqual(repeated,(code,result))
        self.stock()
        body['operation']=str(uuid.uuid4())
        with self.c: code,_=w.save(self.c,'food',body,NOW)
        self.assertEqual(code,409)
        self.assertEqual(len(w.read(self.c,'food')['state']['stocks']),1)

    def test_reset_does_not_reimport_old_gym_copy(self):
        local={'version':1,'selected':'day','done':{},'days':[{'id':'day','name':'День','weekday':None,'groups':[],'exercises':[]}]}
        self.call('gym',command='import',state=local,timezone='Asia/Dubai')
        code,result=self.call('gym',state=w.EMPTY_GYM)
        self.assertEqual(code,200);self.assertEqual(result['state'],w.EMPTY_GYM)
        _,result=self.call('gym',command='import',state=local,timezone='Asia/Dubai')
        self.assertEqual(result['state'],w.EMPTY_GYM)

    def test_threshold_partial_purchase_completion_and_new_cycle(self):
        p=self.stock();self.enable(p);self.assertEqual(self.active(),[])
        self.consume(p,9);tid=self.active()[0]['id'];self.assertIn('9 шт',self.active()[0]['note'])
        self.replenish(p,1);self.assertEqual(self.active()[0]['id'],tid)
        self.replenish(p,8);self.assertEqual(self.active(),[])
        self.consume(p,9);self.assertNotEqual(self.active()[0]['id'],tid)

    def test_moved_purchase_survives_reconcile_and_completion(self):
        p=self.stock(2);self.enable(p)
        versioned=tasks.read(self.c);task=versioned['state']['tasks'][0]
        day=task['date'];tid=task['id']
        task['shifts']={day:{'date':'2026-10-25','time':'10:30'}}
        with self.c: self.assertEqual(tasks.save(self.c,versioned)[0],200)
        self.enable(p)
        versioned=tasks.read(self.c)
        self.assertEqual(versioned['state']['tasks'][0]['shifts'],task['shifts'])
        versioned['state']['done'][tid+'|'+day]=NOW.isoformat()
        with self.c: self.assertEqual(tasks.save(self.c,versioned)[0],200)
        self.enable(p)
        self.assertEqual(self.active(),[])
        self.assertEqual(len(tasks.read(self.c)['state']['tasks']),1)

    def test_repeat_request_and_stale_write(self):
        p=self.stock();v=w.read(self.c,'food')['version']
        body={'operation':str(uuid.uuid4()),'version':v,'command':'stock','product':p,'value':{'name':'Яйца','quantity':5,'unit':'шт','days':5,'date':'2026-10-19','expiry':'','timezone':'Asia/Dubai'}}
        with self.c: first=w.save(self.c,'food',body,NOW)
        with self.c: second=w.save(self.c,'food',body,NOW)
        self.assertEqual(first,second);self.assertEqual(second[1]['state']['stocks'][0]['quantity'],15)
        body['operation']=str(uuid.uuid4())
        with self.c: self.assertEqual(w.save(self.c,'food',body,NOW)[0],409)

    def test_mismatched_operation_rejected(self):
        body={'operation':str(uuid.uuid4()),'version':0,'state':copy.deepcopy(w.EMPTY_GYM)}
        with self.c: w.save(self.c,'gym',body,NOW)
        body['state']['days']=[{}]
        with self.assertRaises(ValueError), self.c: w.save(self.c,'gym',body,NOW)

    def test_two_connections_same_version_only_one_wins(self):
        p=self.stock();version=w.read(self.c,'food')['version'];barrier=threading.Barrier(2);results=[]
        def writer():
            c=sqlite3.connect(self.path,timeout=10)
            try:
                barrier.wait()
                with c:
                    result=w.save(c,'food',{'operation':str(uuid.uuid4()),'version':version,'command':'stock','product':p,'value':{'name':'Яйца','quantity':5,'unit':'шт','days':5,'date':'2026-10-19','expiry':'','timezone':'UTC'}},NOW)
                    results.append(result[0])
            finally:c.close()
        threads=[threading.Thread(target=writer) for _ in range(2)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(sorted(results),[200,409]);self.assertEqual(w.read(self.c,'food')['state']['stocks'][0]['quantity'],15)

    def test_meal_undo_returns_original_lots(self):
        p=self.stock(2);self.replenish(p,3)
        self.consume(p,3);s=w.read(self.c,'food')['state'];self.assertEqual([l['quantity'] for l in s['stocks'][0]['lots']],[0,2])
        s['meals']=[];self.call(state=s);s=w.read(self.c,'food')['state']
        self.assertEqual([l['quantity'] for l in s['stocks'][0]['lots']],[2,3])
        self.assertEqual(s['movements'][-1]['kind'],'return')

    def test_expired_not_consumed_and_rollback(self):
        p=self.stock(2,'2026-10-19');self.enable(p)
        with self.c: w.tick(self.c,(NOW+dt.timedelta(days=1)).timestamp())
        self.assertIn('10 шт',self.active()[0]['note'])
        before=w.read(self.c,'food')
        with self.assertRaises(ValueError): self.consume(p,3)
        self.assertEqual(w.read(self.c,'food'),before)

    def test_forecast_without_browser(self):
        p=self.stock(10);self.enable(p,mode='forecast')
        self.assertEqual(self.active(),[])
        with self.c: w.tick(self.c,(NOW+dt.timedelta(days=4)).timestamp())
        self.assertEqual(len(self.active()),1)
        with self.c: w.tick(self.c,(NOW+dt.timedelta(days=5)).timestamp())
        self.assertEqual(len(self.active()),1)

    def test_completed_and_deleted_tasks_do_not_reappear(self):
        p=self.stock(2);self.enable(p);versioned=tasks.read(self.c);s=versioned['state'];s['tasks']=[]
        with self.c: tasks.save(self.c,{'version':versioned['version'],'state':s})
        with self.c: w.tick(self.c,NOW.timestamp())
        self.assertEqual(self.active(),[])
        self.replenish(p,10);self.consume(p,10)
        versioned=tasks.read(self.c);s=versioned['state'];t=self.active()[0];s['done'][t['id']+'|'+t['date']]=NOW.isoformat()
        with self.c: tasks.save(self.c,{'version':versioned['version'],'state':s})
        self.assertEqual(w.read(self.c,'food')['state']['stocks'][0]['quantity'],2)
        with self.c: w.tick(self.c,NOW.timestamp())
        self.assertEqual(self.active(),[])

    def test_manual_schedule_preserved_and_stale_tasks_rejected(self):
        p=self.stock(2);old=tasks.read(self.c);self.enable(p)
        with self.c: self.assertEqual(tasks.save(self.c,old)[0],409)
        v=tasks.read(self.c);v['state']['tasks'][0]['date']='2026-10-25';v['state']['tasks'][0]['time']='10:30'
        with self.c: tasks.save(self.c,v)
        self.consume(p,1);self.assertEqual(self.active()[0]['date'],'2026-10-25');self.assertEqual(self.active()[0]['time'],'10:30')

    def test_import_idempotent_and_conflicting_copy_preserved(self):
        local={'version':1,'selected':'day','done':{},'days':[{'id':'day','name':'День','weekday':None,'groups':[],'exercises':[]}]}
        self.call('gym',command='import',state=local,timezone='Asia/Dubai');self.call('gym',command='import',state=local,timezone='Asia/Dubai')
        self.assertEqual(len(w.read(self.c,'gym')['state']['days']),1)
        local['days'][0]['name']='Другое'
        with self.assertRaises(ValueError): self.call('gym',command='import',state=local,timezone='Asia/Dubai')
        self.assertEqual(w.read(self.c,'gym')['state']['days'][0]['name'],'День')

    def test_legacy_food_import_preserves_balance_without_enabling_rules(self):
        local={'meals':[{'id':'old-meal','name':'Порция','kind':'Обед','date':'2026-10-18','time':'12:00','note':'','kcal':None,'consumed':{'stockId':'old-stock','unit':'шт','amount':2}}],
               'stocks':[{'id':'old-stock','name':'Яйца','unit':'шт','quantity':4,'batch':10,'days':5,'daily':2,'asOf':'2026-10-18','expiry':'','remind':True}],'demo':False}
        self.call(command='import',state=local,timezone='Asia/Dubai')
        self.call(command='import',state=local,timezone='Asia/Dubai')
        s=w.read(self.c,'food')['state'];self.assertEqual(s['stocks'][0]['quantity'],4);self.assertFalse(s['stocks'][0]['rule']['enabled']);self.assertEqual(self.active(),[])
        s['meals']=[];self.call(state=s);self.assertEqual(w.read(self.c,'food')['state']['stocks'][0]['quantity'],6)

    def test_pause_and_explicit_resume_after_deletion(self):
        p=self.stock(2);self.enable(p);rule=w.read(self.c,'food')['state']['stocks'][0]['rule']
        self.call(command='rule',product=p,value={**rule,'enabled':False});self.assertEqual(self.active(),[])
        self.call(command='rule',product=p,value=rule);t=self.active()[0]
        v=tasks.read(self.c);v['state']['tasks']=[x for x in v['state']['tasks'] if x['id']!=t['id']]
        with self.c:tasks.save(self.c,v)
        self.call(command='rule',product=p,value=rule,resume=True)
        self.assertEqual(len(self.active()),1);self.assertNotEqual(self.active()[0]['id'],t['id'])

    def test_tampered_lot_allocation_rejected_before_restore(self):
        p=self.stock();self.consume(p,1);backup=portability.snapshot(self.c)
        backup['modules']['food']['state']['meals'][0]['consumed']['allocations'][0]['amount']=-1
        before=w.read(self.c,'food')
        with self.assertRaises(ValueError),self.c:portability.process(self.c,{'action':'preview','backup':backup},lambda s:s)
        self.assertEqual(w.read(self.c,'food'),before)

    def test_restore_preserves_subtasks_and_occurrence_checks(self):
        p=self.stock(2);self.enable(p)
        versioned=tasks.read(self.c);task=versioned['state']['tasks'][0]
        task['subtasks']=[{'id':'bag','title':'Взять сумку'}]
        task['subtaskDone']={task['date']:['bag']}
        with self.c: self.assertEqual(tasks.save(self.c,versioned)[0],200)
        backup=portability.snapshot(self.c)
        with self.c: tasks.save(self.c,{'version':tasks.read(self.c)['version'],'state':tasks.EMPTY})
        with self.c: _,preview=portability.process(self.c,{'action':'preview','backup':backup},lambda s:s)
        with self.c:
            code,_=portability.process(self.c,{'action':'restore','backup':backup,**preview,'operation':str(uuid.uuid4())},lambda s:s)
        self.assertEqual(code,200)
        restored=tasks.read(self.c)['state']['tasks'][0]
        self.assertEqual(restored['subtasks'],task['subtasks'])
        self.assertEqual(restored['subtaskDone'],task['subtaskDone'])
        self.assertEqual(len(self.active()),1)

    def test_restore_preview_conflict_and_rollback_copy(self):
        self.stock();backup=portability.snapshot(self.c)
        def med(s):
            if set(s)!={'meds','taken'}: raise ValueError()
        with self.c: _,preview=portability.process(self.c,{'action':'preview','backup':backup},med)
        self.stock()
        body={'action':'restore','backup':backup,**preview,'operation':str(uuid.uuid4())}
        with self.c: self.assertEqual(portability.process(self.c,body,med)[0],409)
        with self.c: _,preview=portability.process(self.c,{'action':'preview','backup':backup},med)
        body.update(preview)
        with self.c: self.assertEqual(portability.process(self.c,body,med)[0],200)
        self.assertEqual(len(w.read(self.c,'food')['state']['stocks']),1)
        self.assertEqual(self.c.execute('SELECT count(*) FROM restore_points').fetchone()[0],1)
        with self.c: self.assertEqual(portability.process(self.c,body,med)[0],200)

    def test_sqlite_backup_restores_new_modules(self):
        p=self.stock(2);self.enable(p)
        with closing(sqlite3.connect(Path(self.temp.name)/'copy.sqlite3')) as target:
            self.c.backup(target)
            self.assertEqual(target.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(w.read(target,'food'),w.read(self.c,'food'))
            self.assertEqual(tasks.read(target),tasks.read(self.c))

    def test_invalid_quantities_and_rules_are_atomic(self):
        p=self.stock();before=w.read(self.c,'food')
        with self.assertRaises(ValueError): self.replenish(p,-1)
        with self.assertRaises(ValueError): self.enable(p,target=1)
        self.assertEqual(w.read(self.c,'food'),before)

    def test_capacity_failure_does_not_consume_stock(self):
        p=self.stock();self.enable(p)
        s={'tasks':[{'id':str(uuid.uuid4()),'title':'Дело','note':'','date':'2026-10-19','time':'18:00','repeat':'once','days':[],'timezone':'UTC'} for _ in range(300)],'done':{}}
        with self.c: tasks.save(self.c,{'version':0,'state':s})
        before=w.read(self.c,'food')
        with self.assertRaises(ValueError): self.consume(p,9)
        self.assertEqual(w.read(self.c,'food'),before)


if __name__=='__main__':unittest.main()
