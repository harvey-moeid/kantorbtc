"""Browser acceptance using private API/stream fixtures, never real provider keys."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, os, time
from urllib.parse import urlparse, parse_qs
Path('test-results').mkdir(exist_ok=True)
now = int(time.time() * 1000)
settings = dict(language='id', quality='low', minRR=1, thresholds=dict(smc=60, indicators=60, volume=60, derivatives=60), enabled=dict(smc=True, indicators=True, volume=True, derivatives=True), minGroups=2, tieMargin=40, ttl={'5m':900,'15m':2700,'H1':10800,'H4':43200,'D1':259200}, emaFast=20, emaSlow=50, rsiPeriod=14, swing=3, discordSignals=True, discordPrices=True, cooldown=60)
base = dict(symbol='BTCUSDT', tf='H1', direction='long', confidence=80, levels=dict(entry=[100,101], sl=90, tp=[120,130]), rr=1.73, status='menunggu_entry', createdAt=now-10000, expiresAt=now+10800000, source='OKX', votes=[], scanner=[], tieBreaker=False, hitTargets=[], settingsVersion=3)
signals = [dict(base,id='btc-h1'),dict(base,id='btc-h4',tf='H4',direction='short',levels=dict(entry=[100,101],sl=110,tp=[80,70])),dict(base,id='gold',symbol='XAUUSD',source='OANDA',expiresAt=None,entryClock=dict(remainingMs=900000,at=now,state='unknown',knownUntil=now)),dict(base,id='ambiguous',status='ambigu',entryTouchedAt=now-5000,ambiguousSince=now-3000)]
def event(id,kind,details=None,price=None):
 return dict(id=id,kind=kind,price=price,at=now-1000,details=details or {})
cot_report=dict(reportDate='2026-10-06',fetchedAt=now,source='https://publicreporting.cftc.gov/resource/72hh-3qpy.json',contract='088691',openInterest=1000,managedMoney=dict(long=100,short=40,spreading=20,net=60),netChange=10)
meetings=[dict(id='cot-fresh',symbol='XAUUSD',tf='H1',at=now,phase='rejected',scanner=[],votes=[],reason='COT fresh fixture',cot=dict(status='fresh',checkedAt=now,warning=None,report=cot_report)),dict(id='cot-stale',symbol='XAUUSD',tf='H4',at=now,phase='rejected',scanner=[],votes=[],reason='COT stale fixture',cot=dict(status='stale',checkedAt=now,warning='CFTC refresh failed; cached data retained.',report=cot_report))]
errors=[]; writes=[]; sockets=[]; audit_requests=[]
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.on('pageerror',lambda error:errors.append(str(error)))
 def socket(ws):
  connection={'socket':ws,'open':True}
  if '/api/public/' not in ws.url: sockets.append(connection)
 page.route_web_socket('**/api/**stream*',socket)
 def route(request):
  parsed=urlparse(request.request.url); path=parsed.path; query=parse_qs(parsed.query)
  if request.request.method not in ('GET','HEAD'): writes.append(path)
  if path=='/api/auth/session': value=dict(authenticated=True)
  elif path=='/api/settings/scanner': value=dict(settings=settings,version=3)
  elif path=='/api/signals': value=dict(signals=signals)
  elif path=='/api/market': value=dict(quotes=[])
  elif path=='/api/meetings': value=dict(meetings=meetings)
  elif path=='/api/alerts': value=dict(alerts=[])
  elif path.endswith('/events'):
   audit_requests.append(path)
   if query.get('cursorId'): value=dict(events=[event('older','menunggu_entry')],nextCursor=None)
   elif '/ambiguous/' in path: value=dict(events=[event('ambigu','ambigu',dict(candleTime=(now-5000)//1000,source='OKX',resolution='unknown'))],nextCursor=None)
   else: value=dict(events=[event('clock','entry_clock',{'from':'open','to':'unknown','remainingMs':900000})],nextCursor=dict(at=now-1000,id='clock'))
  else: value={}
  request.fulfill(json=value)
 page.route('**/api/**',route)
 page.goto('http://127.0.0.1:5173/signals',wait_until='domcontentloaded')
 expect(page.locator('tbody tr')).to_have_count(4)
 row=page.locator('tbody tr').filter(has=page.get_by_text('BTCUSDT',exact=True)).filter(has_text='H1').first
 expect(row.get_by_text('Konflik TF',exact=True)).to_be_visible()
 row.focus(); row.press('Space')
 expect(page.locator('dialog').get_by_text('Konflik arah lintas timeframe; sinyal tetap berjalan mandiri',exact=False)).to_be_visible()
 expect(page.locator('dialog .signal-audit li')).to_have_count(1)
 page.locator('dialog').get_by_role('button',name='Muat riwayat lebih lama',exact=True).click()
 expect(page.locator('dialog .signal-audit li')).to_have_count(2)
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.locator('tbody tr').filter(has_text='XAUUSD').click()
 expect(page.locator('dialog').get_by_text('Dijeda: status provider tidak diketahui.',exact=False)).to_be_visible()
 assert '15 menit' in page.locator('dialog').inner_text()
 # Keep the same selected ID while a server event updates its lifecycle.
 signals[2].update(status='aktif',entryTouchedAt=now,entryTouchedPrice=100)
 next(connection['socket'] for connection in reversed(sockets) if connection['open']).send(json.dumps(dict(type='refresh')))
 expect(page.locator('dialog').get_by_text('Entry tersentuh:',exact=False)).to_be_visible()
 expect(page.locator('dialog').get_by_text('Dijeda: status provider tidak diketahui.',exact=False)).to_have_count(0)
 signals[2].update(status='target_tercapai',hitTargets=[1],exitAt=now+1000,exitPrice=120)
 next(connection['socket'] for connection in reversed(sockets) if connection['open']).send(json.dumps(dict(type='refresh')))
 expect(page.locator('dialog').get_by_text('TP1: 120.00',exact=False)).to_be_visible()
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.locator('tbody tr').filter(has_text='Hasil ambigu').click()
 expect(page.locator('dialog').get_by_text('Hasil tidak ditetapkan:',exact=False)).to_be_visible()
 expect(page.locator('dialog .signal-audit').get_by_text('TP/SL ambigu:',exact=False)).to_be_visible()
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.get_by_role('button',name='Ganti bahasa',exact=True).click()
 page.locator('tbody tr').filter(has_text='Ambiguous outcome').click()
 expect(page.locator('dialog').get_by_text('Outcome unknown:',exact=False)).to_be_visible()
 expect(page.locator('dialog').get_by_role('heading',name='Signal status history',exact=True)).to_be_visible()
 page.screenshot(path='test-results/lifecycle-desktop.png',full_page=True)
 page.set_viewport_size(dict(width=390,height=844))
 assert page.evaluate('document.body.scrollWidth')==390, 'Mobile document overflow'
 assert page.locator('dialog').evaluate('(element)=>element.scrollWidth <= element.clientWidth'), 'Mobile audit overflow'
 page.screenshot(path='test-results/lifecycle-mobile.png',full_page=True)
 page.locator('dialog').get_by_role('button',name='Close',exact=True).click()
 settings['language']='en'
 page.goto('http://127.0.0.1:5173/meetings',wait_until='domcontentloaded')
 page.get_by_role('button').filter(has_text='COT fresh fixture').click()
 cot=page.locator('dialog').get_by_role('region',name='COT',exact=True)
 expect(cot.get_by_text('FRESH',exact=True)).to_be_visible()
 expect(cot.get_by_text('Position date (not release date):',exact=False)).to_be_visible()
 expect(cot.get_by_text('Net: 60',exact=False)).to_be_visible()
 assert page.locator('dialog').evaluate('(element)=>element.scrollWidth <= element.clientWidth'), 'Mobile COT overflow'
 page.locator('dialog').get_by_role('button',name='Close',exact=True).click()
 page.get_by_role('button').filter(has_text='COT stale fixture').click()
 expect(page.locator('dialog').get_by_text('COT is unavailable or stale;',exact=False)).to_be_visible()
 page.screenshot(path='test-results/cot-mobile.png',full_page=True)
 assert not errors, errors
 assert not writes, f'Unexpected API writes: {writes}'
 assert any('/gold/' in request for request in audit_requests)
 browser.close()
print(json.dumps(dict(browser_errors=errors,checks=['private lifecycle fixtures','independent timeframe conflict','keyboard row activation','audit pagination','unknown gold pause','selected signal refresh after entry/TP1','ambiguous outcome without guessing','English audit labels','390px audit layout','fresh and stale COT provenance in meeting','390px COT layout','no provider or mutation calls'])))
