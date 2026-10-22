"""Manual watchlist. Links are stored only; the server never fetches them."""
import re
from urllib.parse import urlsplit

EMPTY = {'items': []}


def validate(state):
    if not isinstance(state, dict) or set(state) != {'items'} or not isinstance(state['items'], list) or len(state['items']) > 1000:
        raise ValueError('В списке может быть до 1000 записей')
    seen = set()
    for item in state['items']:
        if not isinstance(item, dict) or set(item) != {'id', 'title', 'kind', 'note', 'url', 'watched'}:
            raise ValueError('Некорректная запись')
        if not isinstance(item['id'], str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', item['id']) or item['id'] in seen:
            raise ValueError('Некорректный идентификатор')
        seen.add(item['id'])
        for key, limit in [('title', 160), ('note', 2000), ('url', 2048)]:
            if not isinstance(item[key], str) or len(item[key]) > limit:
                raise ValueError('Проверь длину текстовых полей')
        if not item['title'].strip() or item['kind'] not in ('film', 'series', 'other') or type(item['watched']) is not bool:
            raise ValueError('Укажи название и тип записи')
        if item['url']:
            url = urlsplit(item['url'])
            if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or any(c.isspace() or ord(c) < 32 for c in item['url']) or '\\' in item['url']:
                raise ValueError('Укажи полную ссылку с https:// или http:// без логина и пароля')
    return state
