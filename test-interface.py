from pathlib import Path
import json,mimetypes,datetime
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent; OUT=ROOT/'.hub-review/interface-checks'; OUT.mkdir(parents=True,exist_ok=True)
DAY='2026-10-14'
med={'id':'test-med','name':'Проверочный препарат','dose':'1','note':'','start':DAY,'end':'','days':list(range(7)),'times':['09:00','20:00']}
state={'meds':[med],'taken':{},'skipped':{},'fixed':{}}
tasks={'tasks':[{'id':'task-one','title':'Забрать заказ и купить продукты','note':'Проверка длинного названия на маленьком экране','date':DAY,'time':'23:59','repeat':'daily','days':[],'timezone':'Asia/Dubai'},{'id':'task-two','title':'Будущее дело','note':'','date':'2099-01-01','time':'12:00','repeat':'once','days':[],'timezone':'Asia/Dubai'}],'done':{}}
def route(r):
 global state,tasks
 from urllib.parse import urlsplit,unquote
 url=urlsplit(r.request.url);path=unquote(url.path)
 if url.hostname not in ('127.0.0.1','localhost'):
  return r.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eee"/><text x="30" y="150">Test photo</text></svg>')
 if '/api/' in path:
  endpoint=path.split('/api/')[1];data=r.request.post_data_json if r.request.method=='POST' else None
  if endpoint=='session':body={'authenticated':True,'setupRequired':False}
  elif endpoint=='tasks':
   if data:tasks=data['state']
   body={'state':tasks,'version':1}
  elif endpoint=='state':
   if data:state=data['state']
   body={'state':state,'version':1}
  else:body={'enabled':False}
  return r.fulfill(status=200,content_type='application/json',body=json.dumps(body))
 if path.startswith('/gym/') or path=='/gym':
  rel=path.removeprefix('/gym').lstrip('/');file=ROOT/'gym-prototype/dist'/('index.html' if rel in ('','program','catalog') else rel)
 elif path.startswith('/vovrema/'):
  rel=path.removeprefix('/vovrema/');file=ROOT/'dist'/(rel or 'index.html')
 else:
  file=ROOT/'dist'/('hub/index.html' if path=='/' else path.lstrip('/'))
  if file.is_dir():file=file/'index.html'
 if file.exists() and file.is_file():return r.fulfill(status=200,content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream',body=file.read_bytes())
 return r.fulfill(status=404,body='')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
 context.route('**/*',route)
 page=context.new_page();page.clock.install(time=datetime.datetime(2026,10,14,8,tzinfo=datetime.timezone.utc));errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 def go(path):page.goto('http://127.0.0.1:4177'+path);page.wait_for_load_state('networkidle')
 def contrast(colors):
  import re
  def luminance(value):
   rgb=[int(x)/255 for x in re.findall(r'\d+',value)[:3]]
   rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
   return sum(x*w for x,w in zip(rgb,[.2126,.7152,.0722]))
  a,b=sorted([luminance(colors['fg']),luminance(colors['bg'])]);return (b+.05)/(a+.05)
 def no_overflow():assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.url
 go('/')
 page.locator('#hub-settings-open').click()
 for theme in ['air','garden','tiles','night']:
  page.locator('[name=hub-theme][value='+theme+']').check();page.locator('[data-close-settings]').click();no_overflow();page.screenshot(path=str(OUT/('hub-'+theme+'.png')),full_page=True);page.locator('#hub-settings-open').click()
 page.locator('[data-close-settings]').click();page.reload();page.wait_for_load_state('networkidle');assert page.locator('html').get_attribute('data-hub-theme')=='night'
 go('/tasks/');assert page.locator('[data-filter]').count()==3;assert page.locator('.task-row').count()==1
 page.locator('[data-period=any]').click();assert page.locator('.task-row').count()==2
 page.locator('[data-period=today]').click();page.locator('.complete').click();page.locator('[data-filter=done]').click();assert page.locator('.complete').inner_text()=='↶ Отменить';page.locator('.complete').click();page.locator('[data-filter=active]').click()
 for width in [320,390]:
  page.set_viewport_size({'width':width,'height':844})
  for theme in ['air','sage','iris','graphite']:
   page.locator('#open-settings').click();page.locator('[name=tasks-theme][value='+theme+']').check();page.locator('#close-settings').click();no_overflow();page.screenshot(path=str(OUT/(f'tasks-{theme}-{width}.png')),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 go('/gym/program');assert page.locator('.day').count()==0
 page.get_by_role('button',name='Создать день',exact=True).click();page.locator('[name=name]').fill('Свободная тренировка');page.get_by_role('button',name='Сохранить день').click();assert page.locator('.day small').inner_text()=='Без привязки'
 page.get_by_role('button',name='＋ День',exact=True).click();page.locator('[name=weekday]').select_option('2');page.locator('[name=name]').fill('Среда');page.get_by_role('button',name='Сохранить день').click()
 page.reload();page.wait_for_load_state('networkidle');assert page.locator('.day').count()==2;assert 'Без привязки' in page.locator('.days').inner_text()
 go('/gym/catalog');page.locator('[data-catalog-open]').first.wait_for();page.locator('[data-catalog-open]').first.click();assert page.locator('#catalog-add-form input').count()==0;assert page.locator('#catalog-add-form select').count()==1
 page.locator('[data-photo-index]').first.click();assert page.locator('.photo-viewer').is_visible();page.get_by_role('button',name='Закрыть фото',exact=True).click();assert page.locator('.catalog-detail').is_visible()
 page.locator('#catalog-add-form button[type=submit]').click();assert page.locator('.edit-row').count()==1
 page.locator('[data-edit]').first.click();page.locator('[name=sets]').fill('4');page.get_by_role('button',name='Сохранить упражнение',exact=True).click();assert '4 × 12' in page.locator('.edit-row').inner_text()
 for theme in ['original','logbook','studio','sport']:
  page.locator('#gym-settings-open').click();page.locator('[data-style="'+theme+'"]').click()
  color=page.locator('#gym-settings .gym-close').evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})');assert contrast(color)>=3,(theme,color);page.locator('[data-close-settings]').click()
  page.locator('[data-exercise-info]').first.click();color=page.locator('.catalog-detail .gym-close').evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})');assert contrast(color)>=3,(theme,color);no_overflow();page.screenshot(path=str(OUT/('gym-'+theme+'.png')),full_page=True);page.get_by_role('button',name='Закрыть упражнение',exact=True).click()
 go('/vovrema/');page.evaluate("openSkip(today()+'|test-med|20:00')");page.locator('[name=postpone][value=hour]').check();assert page.locator('#skip-submit').inner_text()=='Перенести приём';page.locator('#skip-submit').click();page.wait_for_function("!document.querySelector('#skip-editor').open");assert state['meds'][0]['shifts'][0]['scope']=='once'
 assert page.evaluate("shiftedMoment(state.meds[0],moveMoment(today()+'T09:00',1440)).slice(11)")=='09:00'
 no_overflow()
 for path in ['/vovrema/','/tasks/','/food/','/gym/']:
  go(path);assert page.locator('.app-back').get_attribute('href')=='/';no_overflow()
 assert not errors,errors
 print('PASS: four hub themes, 320/390px task layouts and scopes, completion/undo, empty gym and persistence, optional weekdays, add/edit exercise, photo viewer, themed close buttons, one-time medicine shift and back links')
 browser.close()
