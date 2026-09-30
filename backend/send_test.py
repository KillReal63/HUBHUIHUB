"""Send a manual test only when explicitly requested by the owner."""
import json
import push_system as push

with push.connect() as connection:
    rows = connection.execute('SELECT body FROM push_subscriptions').fetchall()
print('Subscribed devices:', len(rows))
for index, row in enumerate(rows, 1):
    result = push.dispatch(json.loads(row[0]), {
        'title': 'Вовремя',
        'body': 'Это тестовое уведомление от твоего сайта.',
        'tag': 'manual-test',
    })
    print('Device', index, 'delivery service result:', result)
