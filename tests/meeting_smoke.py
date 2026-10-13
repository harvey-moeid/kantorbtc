from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json,os,time,subprocess
base=os.environ.get('KANTOR_BASE_URL','http://127.0.0.1:5173')
Path('test-results').mkdir(exist_ok=True)
# Use real defaults with manual low quality before the first 3D frame. Software
# rendering can legitimately trigger automatic 2D fallback before a UI click.
preferences=subprocess.check_output(['node','--input-type=module','-e',
 "import { defaultSettings } from './packages/shared/src/domain.ts'; console.log(JSON.stringify({state:{settings:{...defaultSettings,quality:'low'},mode2d:false},version:0}));"],
 cwd=Path(__file__).resolve().parents[1],text=True).strip()
def seek(page,value):
 page.get_by_role('slider',name='Posisi replay',exact=True).evaluate("""(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}""",value)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 errors=[]
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.add_init_script(f"localStorage.setItem('kantor-preferences-v1',JSON.stringify({preferences}));")
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base,wait_until='networkidle')
 assert '$67,482' not in page.inner_text('body')
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 # Headless CI uses software rendering; test replay behavior without shadow-map cost.
 page.get_by_label('Kualitas 3D',exact=True).select_option('low')
 expect(page.get_by_label('Statistik render',exact=True)).to_contain_text('LOW',timeout=10000)
 expect(page.locator('.scene-area canvas')).to_be_visible()
 page.get_by_role('button',name='Simulasi rapat',exact=True).click()
 page.get_by_role('button',name='Jeda replay',exact=True).click()
 page.get_by_role('button',name='Ikuti pembicara',exact=True).click()
 page.get_by_role('combobox',name='Kecepatan replay',exact=True).select_option('4')
 seek(page,0)
 page.get_by_role('button',name='Lanjutkan replay',exact=True).click()
 page.wait_for_function('Number(document.querySelector("input[type=range]").value)>=1',timeout=5000)
 page.get_by_role('button',name='Jeda replay',exact=True).click()
 page.get_by_role('combobox',name='Kecepatan replay',exact=True).select_option('1')
 for value,stage in [(12,'scanner_speaking'),(32,'ai_speaking'),(37,'ai_speaking'),(42,'ai_speaking'),(47,'ai_speaking'),(59,'rr_speaking'),(65,'director'),(72,'returning')]:
  seek(page,value)
  page.wait_for_function('(stage)=>document.querySelector(".meeting-playback")?.dataset.stage===stage',arg=stage)
  if value==32:assert 'Atlas' in page.locator('.speaker-caption').inner_text()
  if value==37:assert 'Gem' in page.locator('.speaker-caption').inner_text()
  if value==42:assert 'Nova' in page.locator('.speaker-caption').inner_text()
  if value==47:assert 'Orion' in page.locator('.speaker-caption').inner_text()
  if value==65:
   assert 'Direktur' in page.locator('.speaker-caption').inner_text()
   assert page.get_by_role('button',name='Lantai 2',exact=True).get_attribute('class')=='active'
   page.wait_for_timeout(800)
   page.evaluate('window.scrollTo(0,0)')
   page.screenshot(path='test-results/meeting-director.png',full_page=True)
 page.get_by_role('button',name='Lantai 1',exact=True).click()
 assert page.get_by_role('button',name='Ikuti pembicara',exact=True).get_attribute('aria-pressed')=='false'
 page.get_by_role('combobox',name='Pilih rekaman meeting',exact=True).select_option('DEMO-M-003')
 page.get_by_role('button',name='Jeda replay',exact=True).click();seek(page,25)
 assert page.locator('.meeting-playback').get_attribute('data-stage')=='returning'
 assert 'perspektif AI' not in page.locator('.speaker-caption').inner_text()
 page.get_by_role('button',name='Hentikan replay',exact=True).click()
 assert page.locator('.meeting-playback').count()==0
 page.get_by_role('button',name='Simulasi rapat',exact=True).click()
 replay_position=page.get_by_role('slider',name='Posisi replay',exact=True)
 render_stats=page.get_by_label('Statistik render',exact=True)
 page.wait_for_function('Number(document.querySelector(".meeting-playback input[type=range]").value)>0',timeout=10000)
 page.evaluate("""()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}""")
 # Visibility effects commit asynchronously, especially with software-rendered 3D.
 # Wait for the pause before sampling the replay rather than assuming a fixed delay.
 expect(render_stats).to_contain_text('PAUSED',timeout=10000)
 before=replay_position.input_value()
 page.wait_for_timeout(700)
 expect(replay_position).to_have_value(before)
 page.evaluate("""()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}""")
 expect(render_stats).not_to_contain_text('PAUSED',timeout=10000)
 # A resumed badge alone is insufficient: the replay must also advance again.
 page.wait_for_function('(before)=>Number(document.querySelector(".meeting-playback input[type=range]").value)>Number(before)',arg=before,timeout=10000)
 reduced=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
 reduced.on('pageerror',lambda e:errors.append(str(e)))
 reduced.goto(base,wait_until='networkidle');reduced.get_by_role('button',name='Jelajahi demo',exact=True).click()
 reduced.get_by_role('button',name='Simulasi rapat',exact=True).click();reduced.get_by_role('button',name='Jeda replay',exact=True).click();seek(reduced,37)
 reduced.get_by_role('button',name='Ikuti pembicara',exact=True).click()
 reduced.wait_for_timeout(400)
 assert reduced.evaluate('document.body.scrollWidth')==390
 assert 'ON DEMAND' in reduced.get_by_label('Statistik render',exact=True).inner_text()
 assert reduced.get_by_role('button',name='Lantai 2',exact=True).get_attribute('class')=='active'
 reduced.evaluate('window.scrollTo(0,0)')
 reduced.screenshot(path='test-results/meeting-mobile.png',full_page=True)
 page.close()
 reduced.close()
 public=browser.new_page(viewport={'width':1200,'height':900})
 public.on('pageerror',lambda e:errors.append(str(e)))
 routes=[]
 def handle(ws):
  routes.append(ws)
  ws.send(json.dumps({'type':'meeting','meeting':'scanner','meetingId':'public-fixture','at':int(time.time()*1000),'aiTriggered':False,'reason':'PRIVATE_MARKER_LONG_67400','price':67400}))
 public.route_web_socket('**/api/public/stream',handle)
 public.goto(base,wait_until='networkidle')
 # Transport retries do not depend on 3D; avoid GPU load delaying reconnect timers.
 public.get_by_role('button',name='Ganti mode 2D/3D',exact=True).click()
 public.locator('.meeting-playback').wait_for()
 assert 'PRIVATE_MARKER' not in public.inner_text('body')
 assert '67400' not in public.inner_text('body')
 routes[0].close(code=1011,reason='fixture restart')
 deadline=time.monotonic()+5
 while len(routes)<2 and time.monotonic()<deadline:public.wait_for_timeout(100)
 assert len(routes)>=2,'Public websocket did not reconnect'
 routes[1].close(code=1008,reason='public connection lifetime')
 deadline=time.monotonic()+5
 while len(routes)<3 and time.monotonic()<deadline:public.wait_for_timeout(100)
 assert len(routes)>=3,'Expired public stream did not renew'
 assert not errors,errors
 print(json.dumps({'browser_errors':errors,'checks':['scanner and four AI presentations','RR/director and floor 2','camera follow/manual override','rejected scanner skips AI','pause/seek/speed/record selection','simulated background pause','mobile/reduced motion on-demand','public payload filtering','WebSocket reconnection and public lifetime renewal']}))
 browser.close()
