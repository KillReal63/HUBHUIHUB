import copy
import json
import sqlite3
import unittest
import uuid

import tasks
import watch
import wellness
import data_portability as portability

ITEM = {'id':'movie', 'title':'Кино на вечер', 'kind':'film', 'note':'Посоветовали друзья', 'url':'https://example.com/movie', 'watched':False}


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:')
        self.c.execute('CREATE TABLE state(id INTEGER PRIMARY KEY,version INTEGER,body TEXT)')
        self.c.execute('INSERT INTO state VALUES(1,0,?)',(json.dumps({'meds':[],'taken':{}}),))
        tasks.initialize(self.c);wellness.initialize(self.c);self.c.commit()

    def tearDown(self):
        self.c.close()

    def save(self, items):
        body={'operation':str(uuid.uuid4()),'version':wellness.read(self.c,'watch')['version'],'state':{'items':items}}
        with self.c: result=wellness.save(self.c,'watch',body)
        return body,result

    def test_validation_and_safe_links(self):
        watch.validate({'items':[ITEM]})
        for fields in [{'title':' '},{'kind':'unknown'},{'watched':1},{'note':'x'*2001},{'url':'javascript:alert(1)'},
                       {'url':'//example.com'},{'url':'https://user:secret@example.com'}, {'url':'https://example.com\\evil'},
                       {'url':'https://example.com/\nmovie'}, {'url':'https://'}, {'url':'data:text/html,x'}]:
            with self.subTest(fields=fields),self.assertRaises(ValueError):watch.validate({'items':[{**ITEM,**fields}]})
        for kind in ['film','series','other']:watch.validate({'items':[{**ITEM,'kind':kind,'url':''}]})
        with self.assertRaises(ValueError):watch.validate({'items':[ITEM,ITEM]})
        with self.assertRaises(ValueError):watch.validate({'items':[dict(ITEM,id=str(i)) for i in range(1001)]})

    def test_version_retry_and_isolation(self):
        original_food=wellness.read(self.c,'food');original_tasks=tasks.read(self.c)
        body,(code,result)=self.save([ITEM]);self.assertEqual(code,200)
        with self.c:self.assertEqual(wellness.save(self.c,'watch',body),(200,result))
        stale={**body,'operation':str(uuid.uuid4()),'state':{'items':[]}}
        with self.c:code,conflict=wellness.save(self.c,'watch',stale)
        self.assertEqual(code,409);self.assertEqual(conflict['state'],{'items':[ITEM]})
        self.save([{**ITEM,'watched':True}]);self.assertTrue(wellness.read(self.c,'watch')['state']['items'][0]['watched'])
        self.save([]);self.assertEqual(wellness.read(self.c,'watch')['state'],watch.EMPTY)
        self.assertEqual(wellness.read(self.c,'food'),original_food);self.assertEqual(tasks.read(self.c),original_tasks)

    def test_new_export_restore_and_old_backup_preservation(self):
        self.save([ITEM]);backup=portability.snapshot(self.c)
        self.assertEqual(backup['schema'],2)
        self.save([])
        with self.c:_,preview=portability.process(self.c,{'action':'preview','backup':backup},lambda s:s)
        self.assertEqual(preview['incoming']['Что посмотреть'],1)
        with self.c:code,_=portability.process(self.c,{'action':'restore','backup':backup,**preview,'operation':str(uuid.uuid4())},lambda s:s)
        self.assertEqual(code,200);self.assertEqual(wellness.read(self.c,'watch')['state'],{'items':[ITEM]})
        legacy=copy.deepcopy(backup);legacy['schema']=1;del legacy['modules']['watch']
        self.save([{**ITEM,'title':'Новое название'}]);before=wellness.read(self.c,'watch')
        with self.c:_,preview=portability.process(self.c,{'action':'preview','backup':legacy},lambda s:s)
        self.assertEqual(preview['preserved'],['Что посмотреть'])
        with self.c:code,_=portability.process(self.c,{'action':'restore','backup':legacy,**preview,'operation':str(uuid.uuid4())},lambda s:s)
        self.assertEqual(code,200);self.assertEqual(wellness.read(self.c,'watch'),before)
        incomplete=copy.deepcopy(backup);del incomplete['modules']['watch']
        with self.assertRaises(ValueError):portability.validate(incomplete,lambda s:s)

    def test_unsupported_import_is_rejected_without_changes(self):
        with self.assertRaises(ValueError),self.c:
            wellness.save(self.c,'watch',{'command':'import','operation':str(uuid.uuid4()),'version':0,'state':watch.EMPTY})
        self.assertEqual(wellness.read(self.c,'watch')['version'],0)


if __name__=='__main__':unittest.main()
