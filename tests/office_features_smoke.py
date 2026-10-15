from playwright.sync_api import sync_playwright, expect
import subprocess, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
Path("test-results").mkdir(exist_ok=True)
preferences=subprocess.check_output(['node','--input-type=module','-e', "import { defaultSettings } from './packages/shared/src/domain.ts'; console.log(JSON.stringify({state:{settings:{...defaultSettings,quality:'low'},mode2d:false},version:0}));"],cwd=ROOT,text=True).strip()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1100},reduced_motion='reduce')
 page.add_init_script(f"if(!localStorage.getItem('kantor-preferences-v1')) localStorage.setItem('kantor-preferences-v1',JSON.stringify({preferences}));")
 page.route('**/api/auth/session',lambda route:route.fulfill(json={'authenticated':False}))
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173',wait_until='domcontentloaded')
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 page.get_by_role('button',name='Lantai 1',exact=True).click()
 expect(page.locator('.scene-area canvas')).to_be_visible()
 page.wait_for_timeout(2500)
 # Project the first avatar's head using the scene's documented overview camera.
 point=page.evaluate("""() => {
   const rect=document.querySelector('.scene-area canvas').getBoundingClientRect();
   const fit=Math.max(1,1.1/(rect.width/rect.height));
   const camera=[1.5+14*fit,.35+9.3*fit,16*fit], target=[1.5,.35,0];
   const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
   const norm=(a)=>{const l=Math.hypot(...a);return a.map(n=>n/l)};
   const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
   const forward=norm(target.map((n,i)=>n-camera[i]));
   const right=norm(cross(forward,[0,1,0])), up=cross(right,forward);
   const delta=[-4.2,-.04,3].map((n,i)=>n-camera[i]);
   const height=dot(delta,forward)*Math.tan(39*Math.PI/360);
   return {x:rect.x+rect.width/2+dot(delta,right)*rect.height/(2*height),y:rect.y+rect.height/2-dot(delta,up)*rect.height/(2*height)};
 }""")
 page.mouse.click(point['x'],point['y'])
 expect(page.locator('.avatar-speech')).to_be_visible(timeout=15000)
 expect(page.locator('.avatar-speech strong')).to_have_text('Atlas')
 page.screenshot(path='test-results/avatar-speech.png',full_page=True)
 page.get_by_role('button',name='Tutup percakapan',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Pengaturan',exact=True).click()
 page.get_by_label('Nama Arka',exact=True).fill('Dimas')
 page.get_by_role('button',name='Simpan pengaturan',exact=True).click()
 expect(page.get_by_role('status')).to_contain_text('disimpan')
 page.get_by_role('button',name='Scanner & risiko',exact=True).click()
 page.get_by_label('Strategi SMC',exact=True).select_option('sweep')
 # Locate the numeric input via its wrapping label.
 page.locator('label').filter(has_text='Rasio minimum volume').locator('input').fill('1.8')
 page.get_by_role('button',name='Simpan pengaturan',exact=True).click()
 page.get_by_role('button',name='Susunan AI',exact=True).click()
 page.get_by_label('Provider slot 1',exact=True).select_option('Gemini')
 expect(page.get_by_label('Model slot 1',exact=True)).to_have_value('gemini-2.5-flash')
 page.get_by_label('Pilihan model slot 1',exact=True).select_option('gemini-2.5-pro')
 expect(page.get_by_label('Model slot 1',exact=True)).to_have_value('gemini-2.5-pro')
 page.get_by_label('Pilihan model slot 1',exact=True).select_option('custom')
 page.get_by_label('Model slot 1',exact=True).fill('my-private-model')
 expect(page.get_by_label('Pilihan model slot 1',exact=True)).to_have_value('custom')
 page.get_by_role('button',name='Simpan susunan AI',exact=True).click()
 page.reload(wait_until='domcontentloaded')
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Kantor 3D',exact=True).click()
 expect(page.locator('.team-panel .team-list')).to_contain_text('Dimas')
 page.locator('.team-panel .team-list button').filter(has_text='Dimas').click()
 expect(page.locator('dialog')).to_contain_text('Dimas')
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Pengaturan',exact=True).click()
 page.get_by_role('button',name='Scanner & risiko',exact=True).click()
 expect(page.get_by_label('Strategi SMC',exact=True)).to_have_value('sweep')
 expect(page.locator('label').filter(has_text='Rasio minimum volume').locator('input')).to_have_value('1.8')
 page.get_by_role('button',name='Susunan AI',exact=True).click()
 expect(page.get_by_label('Model slot 1',exact=True)).to_have_value('my-private-model')
 # Check settings remain usable without horizontal overflow on a small screen.
 page.set_viewport_size({'width':390,'height':844})
 for tab in ['Umum & tampilan','Scanner & risiko','Susunan AI']:
  page.get_by_role('button',name=tab,exact=True).click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), tab
 assert not errors,errors
 print(json.dumps({'errors':errors,'checks':'3D avatar click, speech close, rename persistence, scanner persistence, provider-specific model choices, custom model'}))
 b.close()
