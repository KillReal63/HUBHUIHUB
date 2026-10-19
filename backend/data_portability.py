"""User-data export and version-checked restore; excludes auth and push secrets."""
import datetime as dt
import hashlib
import json
import tasks
import wellness


def snapshot(c):
    med_version, med_body = c.execute('SELECT version,body FROM state WHERE id=1').fetchone()
    return {'format':'day-hub-data', 'schema':1, 'exportedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
            'modules':{'medicine':{'version':med_version,'state':json.loads(med_body)},
                       'tasks':tasks.read(c), 'food':wellness.read(c,'food'), 'gym':wellness.read(c,'gym')},
            'links':[{'product':p,'task':t,'suppressed':bool(s)} for p,t,s in c.execute('SELECT product,task,suppressed FROM food_links')]}


def validate(value, validate_medicine):
    if not isinstance(value,dict) or value.get('format') != 'day-hub-data' or value.get('schema') != 1:
        raise ValueError('Неизвестный формат копии')
    modules=value['modules']
    if set(modules) != {'medicine','tasks','food','gym'}: raise ValueError('Неполная копия')
    for name, validator in [('medicine',validate_medicine),('tasks',tasks.validate),('food',lambda s:wellness.validate_food(s,require_allocations=True)),('gym',wellness.validate_gym)]:
        validator(modules[name]['state'])
    stocks={s['id'] for s in modules['food']['state']['stocks']}; seen=set(); linked_tasks=set()
    task_by_id={t['id']:t for t in modules['tasks']['state']['tasks']}
    if not isinstance(value['links'],list) or len(value['links'])>1000: raise ValueError('Некорректные связи')
    for link in value['links']:
        if link['product'] not in stocks or link['product'] in seen or type(link['suppressed']) is not bool: raise ValueError('Некорректная связь')
        seen.add(link['product'])
        if link['task'] is not None:
            wellness.ident(link['task'])
            if link['task'] in linked_tasks: raise ValueError('Одно дело связано с несколькими продуктами')
            linked_tasks.add(link['task'])
            task=task_by_id.get(link['task'])
            if (task is None and not link['suppressed']) or (task is not None and task['repeat']!='once'):
                raise ValueError('Некорректная связанная покупка')
    return value


def versions(value):
    return {k:v['version'] for k,v in value['modules'].items()}


def summary(value):
    m=value['modules']
    return {'Лекарства':len(m['medicine']['state']['meds']), 'Дела':len(m['tasks']['state']['tasks']),
            'Записи питания':len(m['food']['state']['meals']), 'Продукты':len(m['food']['state']['stocks']),
            'Дни тренировок':len(m['gym']['state']['days'])}


def process(c, body, validator):
    value=validate(body['backup'],validator)
    digest=hashlib.sha256(json.dumps(value,sort_keys=True,allow_nan=False).encode()).hexdigest()
    c.execute('BEGIN IMMEDIATE')
    current=snapshot(c)
    if body.get('action') == 'preview':
        return 200, {'digest':digest,'versions':versions(current),'current':summary(current),'incoming':summary(value)}
    if body.get('action') != 'restore' or body.get('digest') != digest: raise ValueError('Сначала проверь копию')
    operation=wellness.ident(body.get('operation'))
    old=c.execute('SELECT digest FROM module_operations WHERE id=?',(operation,)).fetchone()
    if old:
        if old[0] != digest: raise ValueError('Повторный идентификатор')
        return 200, {'ok':True}
    if body.get('versions') != versions(current):
        return 409, {'error':'После предпросмотра появились изменения. Проверь копию заново.'}
    c.execute('CREATE TABLE IF NOT EXISTS restore_points(id TEXT PRIMARY KEY,created TEXT NOT NULL,body TEXT NOT NULL)')
    c.execute('INSERT INTO restore_points VALUES(?,?,?)',(operation,dt.datetime.now(dt.timezone.utc).isoformat(),json.dumps(current,ensure_ascii=False)))
    c.execute('DELETE FROM restore_points WHERE id NOT IN (SELECT id FROM restore_points ORDER BY created DESC LIMIT 5)')
    modules=value['modules']
    for table,name in [('state','medicine'),('tasks_state','tasks')]:
        c.execute(f'UPDATE {table} SET version=version+1,body=? WHERE id=1',(json.dumps(modules[name]['state'],ensure_ascii=False),))
    for name in ('food','gym'): wellness.put(c,name,modules[name]['state'])
    c.execute('DELETE FROM food_links')
    for link in value['links']:
        c.execute('INSERT INTO food_links VALUES(?,?,?)',(link['product'],link['task'],int(link['suppressed'])))
    # Restored balances must not immediately re-send historical purchases.
    c.execute('INSERT INTO module_operations VALUES(?,?,?)',(operation,digest,'{}'))
    c.commit()
    return 200, {'ok':True}
