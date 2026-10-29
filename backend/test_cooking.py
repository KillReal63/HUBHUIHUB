import copy
import uuid
import unittest
import wellness as w
import data_portability as portability
import test_wellness as fixtures
NOW = fixtures.NOW


class Cooking(unittest.TestCase):
    setUp = fixtures.Wellness.setUp
    tearDown = fixtures.Wellness.tearDown
    call = fixtures.Wellness.call
    stock = fixtures.Wellness.stock
    replenish = fixtures.Wellness.replenish
    enable = fixtures.Wellness.enable
    active = fixtures.Wellness.active

    def recipe(self, ingredients=None):
        state=w.read(self.c,'food')['state']
        state['recipes']=[{'id':'recipe','name':'Омлет','kind':'Завтрак','note':'','kcal':120,
                           'ingredients':ingredients or [{'name':'Яйца','quantity':2,'unit':'шт'}]}]
        self.assertEqual(self.call(state=state)[0],200)

    def cook(self, **extra):
        return self.call(command='cook',recipe='recipe',servings=2,timezone='Asia/Dubai',**extra)

    def test_multiple_stocks_fefo_and_exact_undo(self):
        first=self.stock(3,'2026-10-25');second=self.stock(2,'2026-10-20')
        self.recipe([{'name':'  ЯЙЦА  ','quantity':1,'unit':'шт'},{'name':'яйца','quantity':1,'unit':'шт'}])
        original=copy.deepcopy(w.read(self.c,'food')['state']['stocks'])
        code,result=self.cook();self.assertEqual(code,200)
        state=result['state'];meal=state['meals'][0]
        self.assertEqual(meal['kcal'],240);self.assertEqual(meal['servings'],2)
        self.assertEqual([s['quantity'] for s in state['stocks']],[1,0])
        self.assertEqual({u['stockId']:u['amount'] for u in meal['consumptions']},{first:2,second:2})
        # Other saves and exports preserve allocations; deleting the recipe does not break undo.
        state['recipes']=[];self.assertEqual(self.call(state=state)[0],200)
        w.validate_food(copy.deepcopy(state),require_allocations=True)
        state=w.read(self.c,'food')['state'];state['meals']=[]
        code,result=self.call(state=state);self.assertEqual(code,200)
        self.assertEqual([s['lots'] for s in result['state']['stocks']],[s['lots'] for s in original])

    def test_missing_ingredient_is_atomic_and_expired_excluded(self):
        self.stock(10,'2026-10-19');self.recipe([{'name':'Яйца','quantity':2,'unit':'шт'},{'name':'Рис','quantity':100,'unit':'г'}])
        before=w.read(self.c,'food')
        with self.assertRaisesRegex(ValueError,'Рис'):self.cook()
        self.assertEqual(w.read(self.c,'food'),before)
        self.recipe()
        import datetime as dt
        body={'operation':str(uuid.uuid4()),'version':w.read(self.c,'food')['version'],'command':'cook','recipe':'recipe','servings':1,'timezone':'Asia/Dubai'}
        with self.c,self.assertRaisesRegex(ValueError,'Яйца'):w.save(self.c,'food',body,NOW+dt.timedelta(days=1))

    def test_retry_conflict_and_autopurchase(self):
        product=self.stock(5);self.enable(product);self.recipe()
        body={'operation':str(uuid.uuid4()),'version':w.read(self.c,'food')['version'],'command':'cook','recipe':'recipe','servings':2,'timezone':'Asia/Dubai'}
        with self.c:code,result=w.save(self.c,'food',body,NOW)
        self.assertEqual(code,200);self.assertEqual(len(self.active()),1)
        with self.c:code,again=w.save(self.c,'food',body,NOW)
        self.assertEqual(result,again);self.assertEqual(len(again['state']['meals']),1)
        body['operation']=str(uuid.uuid4())
        with self.c:self.assertEqual(w.save(self.c,'food',body,NOW)[0],409)
        state=again['state'];state['meals']=[];self.call(state=state)
        self.assertEqual(self.active(),[])

    def test_bad_inputs_and_unit_mismatch(self):
        self.stock();self.recipe()
        for value in [0,-1,101,True,None,float('inf')]:
            with self.subTest(value=value),self.assertRaises(ValueError):
                self.call(command='cook',recipe='recipe',servings=value,timezone='Asia/Dubai')
        self.recipe([{'name':'Яйца','quantity':2,'unit':'г'}])
        with self.assertRaisesRegex(ValueError,'Не хватает'):self.cook()
        self.assertEqual(w.read(self.c,'food')['state']['stocks'][0]['quantity'],10)

    def test_allocations_are_validated_for_restore(self):
        self.stock();self.recipe();_,result=self.cook()
        backup=portability.snapshot(self.c)
        portability.validate(backup,lambda state:state)
        self.assertEqual(backup['modules']['food']['state'],result['state'])
        state=result['state'];state['meals'][0]['consumptions'][0]['allocations'][0]['amount']=100
        with self.assertRaises(ValueError):w.validate_food(state,require_allocations=True)


if __name__=='__main__':unittest.main()
