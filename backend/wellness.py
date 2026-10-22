"""Versioned module data and transactional inventory-to-task integration."""
import copy
import datetime as dt
import hashlib
import json
import math
import re
import uuid
from zoneinfo import ZoneInfo
import tasks
import watch

EMPTY_FOOD = {'meals': [], 'stocks': [], 'recipes': [], 'plans': [], 'demo': False, 'movements': []}
EMPTY_GYM = {'version': 1, 'selected': None, 'done': {}, 'days': []}


def initialize(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS module_state(module TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS module_operations(id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS module_imports(module TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(module,digest));
    CREATE TABLE IF NOT EXISTS food_links(product TEXT PRIMARY KEY, task TEXT, suppressed INTEGER NOT NULL DEFAULT 0);
    ''')
    for module, empty in [('food', EMPTY_FOOD), ('gym', EMPTY_GYM), ('watch', watch.EMPTY)]:
        c.execute('INSERT OR IGNORE INTO module_state VALUES(?,0,?)', (module, json.dumps(empty)))


def read(c, module):
    version, body = c.execute('SELECT version,body FROM module_state WHERE module=?', (module,)).fetchone()
    return {'version': version, 'state': json.loads(body)}


def put(c, module, state):
    c.execute('UPDATE module_state SET version=version+1,body=? WHERE module=?', (json.dumps(state, ensure_ascii=False, allow_nan=False), module))


def ident(v):
    if not isinstance(v, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', v):
        raise ValueError('Некорректный идентификатор')
    return v


def text(v, limit=240, required=False):
    if not isinstance(v, str) or len(v) > limit or (required and not v.strip()):
        raise ValueError('Проверь текстовые поля')


def number(v, minimum=0, maximum=100000000):
    if type(v) not in (float, int) or not math.isfinite(v) or not minimum <= v <= maximum:
        raise ValueError('Некорректное количество')
    return v


def items(v, limit=10000):
    if not isinstance(v, list) or len(v) > limit:
        raise ValueError('Слишком много записей')
    seen = set()
    for x in v:
        if not isinstance(x, dict) or ident(x.get('id')) in seen:
            raise ValueError('Повторный идентификатор')
        seen.add(x['id'])
    return seen


def clock(v):
    if not isinstance(v, str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', v):
        raise ValueError('Некорректное время')


def zone(v):
    text(v, 80, True)
    try:
        return ZoneInfo(v)
    except Exception as exc:
        raise ValueError('Некорректный часовой пояс') from exc


def rule(v):
    if not isinstance(v, dict) or set(v) != {'enabled','mode','threshold','target','leadDays','time','timezone'}:
        raise ValueError('Некорректное правило покупки')
    if type(v['enabled']) is not bool or v['mode'] not in ('threshold', 'forecast'):
        raise ValueError('Некорректный режим покупки')
    number(v['threshold']); number(v['target'], 0.01); number(v['leadDays'], 0, 365)
    if v['target'] <= v['threshold']:
        raise ValueError('Целевой запас должен быть больше минимального')
    clock(v['time']); zone(v['timezone'])


def validate_gym(s):
    if not isinstance(s, dict) or set(s) != {'version','selected','done','days'} or s['version'] != 1:
        raise ValueError('Некорректная программа')
    days = items(s['days'], 100)
    if s['selected'] is not None and s['selected'] not in days:
        raise ValueError('Не найден выбранный день')
    exercise_ids = set()
    groups = {'chest','back','shoulders','biceps','triceps','legs','glutes','abs'}
    for day in s['days']:
        text(day['name'], 70, True)
        if day['weekday'] is not None and (type(day['weekday']) is not int or not 0 <= day['weekday'] <= 6):
            raise ValueError('Некорректный день недели')
        if not isinstance(day['groups'], list) or any(x not in groups for x in day['groups']):
            raise ValueError('Некорректная группа')
        ids = items(day['exercises'], 500)
        if ids & exercise_ids:
            raise ValueError('Повтор упражнения')
        exercise_ids |= ids
        for e in day['exercises']:
            text(e['name'], 150, True); text(e.get('note',''), 500)
            if e['group'] not in groups:
                raise ValueError('Некорректная группа')
            number(e['sets'], 1, 50); number(e['reps'], 1, 1000)
            if e['weight'] != '': number(e['weight'], 0, 2000)
            if 'reference' in e:
                if not isinstance(e['reference'], dict): raise ValueError('Некорректная ссылка на каталог')
                # The catalog owns this metadata; bound its size and forbid executable markup.
                if len(json.dumps(e['reference'])) > 15000: raise ValueError('Слишком большая ссылка')
    if not isinstance(s['done'], dict) or any(k not in exercise_ids or type(v) is not bool for k,v in s['done'].items()):
        raise ValueError('Некорректные отметки')
    return s


def validate_food(s, require_allocations=False):
    if not isinstance(s, dict) or set(s) != set(EMPTY_FOOD) or type(s['demo']) is not bool:
        raise ValueError('Некорректный дневник')
    stock_ids = items(s['stocks'], 1000)
    stocks = {x['id']:x for x in s['stocks']}
    for stock in s['stocks']:
        text(stock['name'], 80, True)
        if stock['unit'] not in ('г','мл','шт'): raise ValueError('Некорректная единица')
        number(stock['quantity']); number(stock['batch'], 0.01); number(stock['days'], 1, 3650); number(stock['daily'])
        tasks.date(stock['asOf'])
        if stock.get('expiry'): tasks.date(stock['expiry'])
        rule(stock['rule']); items(stock['lots'], 10000)
        for lot in stock['lots']:
            number(lot['quantity']); tasks.date(lot['date'])
            if lot['expiry']:
                tasks.date(lot['expiry'])
                if lot['expiry'] < lot['date']: raise ValueError('Срок раньше покупки')
        if abs(sum(l['quantity'] for l in stock['lots'])-stock['quantity']) > 0.00001:
            raise ValueError('Остаток не совпадает с партиями')
    items(s['meals'])
    recipe_ids = items(s['recipes'], 2000)
    for m in s['meals'] + s['recipes']:
        text(m['name'], 120, True); text(m['note'], 240)
        if m['kind'] not in ('Завтрак','Обед','Ужин','Перекус'): raise ValueError('Некорректный приём пищи')
        if m['kcal'] is not None: number(m['kcal'], 0, 20000)
    for m in s['meals']:
        tasks.date(m['date']); clock(m['time'])
        if m['consumed']:
            used = m['consumed']
            ident(used['stockId']); number(used['amount'], 0.000001)
            if used['unit'] not in ('г','мл','шт'): raise ValueError('Некорректная единица')
            if used['stockId'] not in stock_ids or stocks[used['stockId']]['unit'] != used['unit']:
                raise ValueError('Не найден продукт для порции')
            if 'legacy' in used and used['legacy'] is not True: raise ValueError('Некорректная старая порция')
            allocations = used.get('allocations')
            if allocations is not None:
                if not isinstance(allocations,list) or not allocations or len(allocations)>10000: raise ValueError('Некорректное списание партий')
                lots = {l['id'] for l in stocks[used['stockId']]['lots']}; seen=set()
                for allocation in allocations:
                    if allocation['lot'] not in lots or allocation['lot'] in seen: raise ValueError('Партия списания не найдена')
                    seen.add(allocation['lot']);number(allocation['amount'],0.000001)
                if abs(sum(a['amount'] for a in allocations)-used['amount'])>0.00001: raise ValueError('Количество порции не совпадает с партиями')
            elif require_allocations and not used.get('legacy'):
                raise ValueError('Нет истории списания порции')
    for r in s['recipes']:
        if not isinstance(r['ingredients'], list) or len(r['ingredients']) > 100: raise ValueError('Слишком много ингредиентов')
        for i in r['ingredients']:
            text(i['name'], 80, True); number(i['quantity'], 0.000001)
            if i['unit'] not in ('г','мл','шт'): raise ValueError('Некорректная единица')
    items(s['plans'])
    for p in s['plans']:
        tasks.date(p['date']); number(p['servings'], 0.5, 100)
        if p['recipeId'] not in recipe_ids: raise ValueError('Не найден рецепт')
    items(s['movements'], 50000)
    for m in s['movements']:
        ident(m['stockId']); text(m['kind'], 30, True); text(m['at'], 40, True)
        number(m['amount'], -100000000)
        if m['stockId'] not in stock_ids or m['kind'] not in ('purchase','consume','return','discard'):
            raise ValueError('Некорректное движение продукта')
        if dt.datetime.fromisoformat(m['at'].replace('Z','+00:00')).tzinfo is None:
            raise ValueError('В истории не указан часовой пояс')
    return s


def refresh_stock(s):
    s['quantity'] = round(sum(l['quantity'] for l in s['lots']), 6)
    s['expiry'] = min((l['expiry'] for l in s['lots'] if l['quantity'] > 0 and l['expiry']), default='')
    s['remind'] = s['rule']['enabled']


def available(s, day):
    return sum(l['quantity'] for l in s['lots'] if not l['expiry'] or l['expiry'] >= day)


def movement(state, stock, kind, amount, now):
    state['movements'].append({'id':str(uuid.uuid4()), 'stockId':stock['id'], 'kind':kind, 'amount':amount, 'at':now.isoformat()})
    stock['asOf'] = now.astimezone(zone(stock['rule']['timezone'])).date().isoformat()
    refresh_stock(stock)


def normalize_import(module, incoming, timezone):
    s = copy.deepcopy(incoming)
    zone(timezone)
    if module == 'gym':
        for d in s['days']: d.setdefault('weekday', None)
        return validate_gym(s)
    s.setdefault('recipes', []); s.setdefault('plans', []); s.setdefault('movements', [])
    s.setdefault('demo', False)
    for stock in s['stocks']:
        stock.setdefault('rule', {'enabled':False, 'mode':'threshold', 'threshold':0, 'target':stock['batch'], 'leadDays':1, 'time':'18:00', 'timezone':timezone})
        stock.setdefault('lots', [{'id':str(uuid.uuid5(uuid.NAMESPACE_URL, 'legacy-lot/'+stock['id'])), 'quantity':stock['quantity'], 'date':stock['asOf'], 'expiry':stock.get('expiry','')}])
        refresh_stock(stock)
    # Older consumed portions predate the opening balance; preserve them without inventing lots.
    for meal in s['meals']:
        if meal.get('consumed') and 'allocations' not in meal['consumed']:
            meal['consumed']['legacy'] = True
    return validate_food(s,require_allocations=True)


def reconcile(c, state, now):
    task_state = tasks.read(c)['state']
    before = copy.deepcopy(task_state)
    by_id = {t['id']: t for t in task_state['tasks']}
    current_products = {s['id'] for s in state['stocks']}
    def close(task):
        task_state['done'].setdefault(task['id']+'|'+task['date'], now.isoformat())
    for product, tid, suppressed in c.execute('SELECT product,task,suppressed FROM food_links').fetchall():
        if product not in current_products:
            if tid in by_id: close(by_id[tid])
            c.execute('DELETE FROM food_links WHERE product=?', (product,))
    for stock in state['stocks']:
        r = stock['rule']; local = now.astimezone(zone(r['timezone'])); day = local.date().isoformat()
        qty = available(stock, day)
        low = qty <= r['threshold']
        if r['mode'] == 'forecast' and stock['daily'] > 0:
            elapsed = max(0, (local.date()-tasks.date(stock['asOf'])).days)
            low = low or qty/stock['daily'] - elapsed <= r['leadDays']
        row = c.execute('SELECT task,suppressed FROM food_links WHERE product=?', (stock['id'],)).fetchone()
        tid, suppressed = row if row else (None, 0)
        task = by_id.get(tid)
        if task and task['id']+'|'+task['date'] in task_state['done']: suppressed = 1
        if tid and not task: suppressed = 1
        if not r['enabled'] or state['demo']:
            if task: close(task)
            c.execute('INSERT OR REPLACE INTO food_links VALUES(?,NULL,0)', (stock['id'],))
            continue
        if not low:
            if task: close(task)
            c.execute('INSERT OR REPLACE INTO food_links VALUES(?,NULL,0)', (stock['id'],))
            continue
        if suppressed:
            c.execute('UPDATE food_links SET suppressed=1 WHERE product=?', (stock['id'],))
            continue
        if not task:
            if len(task_state['tasks']) >= 300: raise ValueError('В делах достигнут лимит: освободи место для покупки')
            h,m = map(int, r['time'].split(':'))
            due = local.replace(hour=h, minute=m, second=0, microsecond=0)
            if due <= local: due += dt.timedelta(days=1)
            tid = str(uuid.uuid4())
            task = {'id':tid, 'title':'Купить '+stock['name'], 'note':'', 'date':due.date().isoformat(), 'time':r['time'], 'repeat':'once', 'days':[], 'timezone':r['timezone']}
            task_state['tasks'].append(task)
            c.execute('INSERT OR REPLACE INTO food_links VALUES(?,?,0)', (stock['id'],tid))
        # Preserve user title, notes and schedule. Only replace our quantity line.
        marker = '[Питание] '
        note = '\n'.join(line for line in task['note'].splitlines() if not line.startswith(marker))
        amount = round(max(0, r['target']-qty), 6)
        reason = ' Просроченные партии исключены.' if qty < stock['quantity'] else (' По оценке расхода.' if r['mode']=='forecast' else '')
        task['note'] = (note[:750]+'\n' if note else '')+f'{marker}Купить {amount:g} {stock["unit"]}; доступно {qty:g} {stock["unit"]}.'+reason
    if before != task_state:
        tasks.validate(task_state)
        c.execute('UPDATE tasks_state SET body=?,version=version+1 WHERE id=1', (json.dumps(task_state, ensure_ascii=False),))


def shopping(c, state):
    by_id = {t['id']:t for t in tasks.read(c)['state']['tasks']}
    return [{'product':p, 'task':by_id.get(t), 'suppressed':bool(s)} for p,t,s in c.execute('SELECT product,task,suppressed FROM food_links')]


def response(c, module):
    result = read(c, module)
    if module == 'food': result['shopping'] = shopping(c, result['state'])
    return result


def apply_meals(old, new, now):
    previous = {m['id']:m for m in old['meals']}; incoming = {m['id']:m for m in new['meals']}
    stocks = {s['id']:s for s in new['stocks']}
    for mid, meal in previous.items():
        if mid in incoming:
            if incoming[mid] != meal: raise ValueError('Изменение существующей порции не поддерживается')
            continue
        used = meal['consumed']
        if not used: continue
        stock = stocks.get(used['stockId'])
        if not stock: raise ValueError('Продукт для возврата отсутствует')
        allocations = used.get('allocations', [])
        if used.get('legacy'):
            stock['lots'].append({'id':str(uuid.uuid4()), 'quantity':used['amount'], 'date':meal['date'], 'expiry':''})
        else:
            for allocation in allocations:
                lot = next(l for l in stock['lots'] if l['id'] == allocation['lot'])
                lot['quantity'] += allocation['amount']
        movement(new, stock, 'return', used['amount'], now)
    for mid, meal in incoming.items():
        if mid in previous or not meal['consumed']: continue
        used = meal['consumed']; stock = stocks.get(used['stockId'])
        if not stock or used['unit'] != stock['unit']: raise ValueError('Продукт не найден')
        local_day = now.astimezone(zone(stock['rule']['timezone'])).date().isoformat()
        if meal['date'] != local_day: raise ValueError('Списывать можно только сегодняшнюю порцию')
        remaining = used['amount']; allocations = []
        for lot in sorted(stock['lots'], key=lambda l:l['expiry'] or '9999'):
            if lot['expiry'] and lot['expiry'] < local_day: continue
            amount = min(lot['quantity'], remaining)
            if amount > 0:
                lot['quantity'] = round(lot['quantity']-amount, 6); remaining = round(remaining-amount, 6)
                allocations.append({'lot':lot['id'], 'amount':amount})
        if remaining > 0.000001: raise ValueError('Недостаточно непросроченного продукта')
        used.pop('legacy', None); used['allocations'] = allocations
        movement(new, stock, 'consume', -used['amount'], now)


def food_command(s, body, now, c):
    command = body['command']; product = body.get('product')
    stock = next((x for x in s['stocks'] if x['id'] == product), None)
    if command == 'stock':
        v = body['value']; quantity = number(v['quantity'], 0.000001)
        tasks.date(v['date']); timezone = v['timezone']; zone(timezone)
        if v['date'] > now.astimezone(zone(timezone)).date().isoformat(): raise ValueError('Дата покупки в будущем')
        if stock is None:
            if product: raise ValueError('Продукт не найден')
            stock = {'id':str(uuid.uuid4()), 'name':v['name'].strip(), 'unit':v['unit'], 'lots':[], 'quantity':0, 'batch':quantity, 'days':v['days'], 'daily':quantity/v['days'], 'asOf':v['date'], 'expiry':'', 'remind':False,
                     'rule':{'enabled':False,'mode':'threshold','threshold':0,'target':quantity,'leadDays':1,'time':'18:00','timezone':timezone}}
            s['stocks'].append(stock)
        stock['lots'].append({'id':str(uuid.uuid4()), 'quantity':quantity, 'date':v['date'], 'expiry':v['expiry']})
        stock.update(batch=quantity, days=v['days'], daily=quantity/number(v['days'], 1, 3650))
        movement(s, stock, 'purchase', quantity, now)
    elif command == 'rule':
        if stock is None: raise ValueError('Продукт не найден')
        rule(body['value']); stock['rule'] = body['value']; refresh_stock(stock)
        if body.get('resume') is True:
            c.execute('UPDATE food_links SET suppressed=0,task=NULL WHERE product=? AND suppressed=1', (stock['id'],))
    elif command == 'discard':
        if stock is None: raise ValueError('Продукт не найден')
        lot = next((l for l in stock['lots'] if l['id'] == body['lot']), None)
        if not lot: raise ValueError('Партия не найдена')
        quantity = number(body['quantity'], 0.000001)
        if quantity > lot['quantity']: raise ValueError('Количество больше остатка')
        lot['quantity'] -= quantity; movement(s, stock, 'discard', -quantity, now)
    else:
        raise ValueError('Неизвестное действие')
    return s


def save(c, module, body, now=None):
    if module == 'watch' and body.get('command'):
        raise ValueError('Список сохраняется целиком; импорт локальных записей не требуется')
    now = now or dt.datetime.now(dt.timezone.utc)
    op = ident(body.get('operation'))
    digest = hashlib.sha256(json.dumps([module,body], sort_keys=True, allow_nan=False).encode()).hexdigest()
    c.execute('BEGIN IMMEDIATE')
    previous = c.execute('SELECT digest,result FROM module_operations WHERE id=?', (op,)).fetchone()
    if previous:
        if previous[0] != digest: raise ValueError('Идентификатор операции уже использован')
        return 200, response(c, module)
    current = read(c, module)
    if type(body.get('version')) is not int or body['version'] != current['version']:
        return 409, {'error':'Данные изменились на другом устройстве. Повтори действие после обновления.', **response(c,module)}
    s = copy.deepcopy(current['state'])
    if body.get('command') == 'import':
        fingerprint = hashlib.sha256(json.dumps(body['state'], sort_keys=True, allow_nan=False).encode()).hexdigest()
        if c.execute('SELECT 1 FROM module_imports WHERE module=? AND digest=?', (module,fingerprint)).fetchone():
            return 200, response(c,module)
        incoming = normalize_import(module, body['state'], body['timezone'])
        fields = ['days'] if module == 'gym' else ['stocks','meals','recipes','plans']
        # Repeated IDs may represent divergent device copies. Never overwrite implicitly.
        for field in fields:
            existing = {x['id']:x for x in s[field]}
            for item in incoming[field]:
                if item['id'] in existing and existing[item['id']] != item:
                    raise ValueError('Локальные записи расходятся с серверными. Сначала выгрузи обе копии.')
                if item['id'] not in existing: s[field].append(item)
        if module == 'gym':
            if any(k in s['done'] and s['done'][k] != v for k,v in incoming['done'].items()): raise ValueError('Отметки расходятся')
            s['done'].update(incoming['done']); s['selected'] = s['selected'] or incoming['selected']
        else:
            # Import opening balances, never replay historical consumption.
            s['demo'] = False
        c.execute('INSERT INTO module_imports VALUES(?,?)', (module,fingerprint))
    elif module == 'food' and body.get('command') == 'reset':
        s = copy.deepcopy(EMPTY_FOOD)
    elif module == 'food' and body.get('command'):
        s = food_command(s, body, now, c)
    else:
        incoming = copy.deepcopy(body['state'])
        if module == 'food':
            validate_food(incoming)
            if incoming['stocks'] != s['stocks'] or incoming['movements'] != s['movements'] or incoming['demo'] != s['demo']:
                raise ValueError('Запасы изменяются отдельной операцией')
            apply_meals(s, incoming, now)
        s = incoming
    if module == 'food': validate_food(s,require_allocations=True)
    elif module == 'watch': watch.validate(s)
    else: validate_gym(s)
    if module == 'food': reconcile(c, s, now)
    put(c, module, s)
    c.execute('INSERT INTO module_operations VALUES(?,?,?)', (op,digest,'{}'))
    result = response(c, module)
    c.commit()
    return 200, result


def tick(c, timestamp):
    if not c.execute("SELECT 1 FROM sqlite_master WHERE name='module_state'").fetchone(): return
    c.execute('BEGIN IMMEDIATE')
    reconcile(c, read(c,'food')['state'], dt.datetime.fromtimestamp(timestamp, dt.timezone.utc))
    c.commit()
