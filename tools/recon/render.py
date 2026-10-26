# 프리팹 노드 위치 + 스프라이트로 맵 재조립 (원작 단위 1 = 100px, PPU)
import pickle,json,sys,os,math
from PIL import Image
from nodes import world,glb,P
T=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/Texture2D/'
idx=pickle.load(open('sprites.pkl','rb'))
texmap={int(k):v[1] for k,v in json.load(open(sys.argv[2])).items() if v}
pngs=set(os.listdir(T))
SCALE=float(sys.argv[4]) if len(sys.argv)>4 else 1.0
cache={}
BYTEX={}
_seen=set()
for _n,_l in idx.items():
    for _s in _l:
        k=(_s['tex'],_s['rect']['m_X'],_s['rect']['m_Y'],_s['rect']['m_Width'])
        if k in _seen: continue
        _seen.add(k); BYTEX.setdefault(_s['tex'],[]).append(_s)
def tex(f):
    if f not in cache: cache[f]=Image.open(T+f).convert('RGBA')
    return cache[f]
def sprite_img(name):
    s=idx[name][0]
    # 한 장짜리 텍스처: 이름이 같은 PNG
    for cand in (name+'.png', name+'_0.png'):
        if cand in pngs:
            im=tex(cand); r=s['rect']
            if abs(im.size[0]-r['m_Width'])<=2 and abs(im.size[1]-r['m_Height'])<=4: return im,s
    f=texmap.get(s['tex'])
    if not f: return None,s
    im=tex(f); H=im.size[1]; r=s['rect']
    box=(int(r['m_X']),int(H-r['m_Y']-r['m_Height']),int(round(r['m_X']+r['m_Width'])),int(round(H-r['m_Y'])))
    out=im.crop(box)
    # 타이트 메시 스프라이트: 사각형 안에 다른 스프라이트가 끼어 있으면 지운다
    area=r['m_Width']*r['m_Height']
    if area>200*200:
        from PIL import ImageDraw
        out=out.copy(); d=ImageDraw.Draw(out)
        for o in BYTEX.get(s['tex'],[]):
            orr=o['rect']
            if orr is r or orr['m_Width']*orr['m_Height']>=area*0.9: continue
            x0=orr['m_X']-r['m_X']; y1=r['m_Y']+r['m_Height']-orr['m_Y']; y0=y1-orr['m_Height']
            d.rectangle([x0-1,y0-1,x0+orr['m_Width']+1,y1+1],fill=(0,0,0,0))
    return out,s
nodes=world(glb(P+sys.argv[1]))
ALIAS=json.load(open(os.environ['ALIAS'])) if os.environ.get('ALIAS') else {}
SKIP=os.environ.get('SKIP','/Halloween').split(',')
items=[]
for n in nodes:
    if any(k in n['path'] for k in SKIP): continue
    base=n['name'].split(' (')[0]
    if base in ('Arrow','CleaningIndicator','Shadow','Shadows','Collider','Dummy'): continue
    nm=ALIAS.get(n['name'], ALIAS.get(base, n['name'] if n['name'] in idx else base))
    if nm not in idx: continue
    im,s=sprite_img(nm)
    if im is None: continue
    items.append((n,im,s))
# 범위
xs=[];ys=[]
for n,im,s in items:
    ppu=s['ppu'] or 100
    w=im.size[0]/ppu*abs(n['sx']); h=im.size[1]/ppu*abs(n['sy'])
    xs+= [n['x']-w, n['x']+w]; ys+=[n['y']-h,n['y']+h]
minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
PPU=100*SCALE
W=int((maxx-minx)*PPU)+20; H=int((maxy-miny)*PPU)+20
canvas=Image.new('RGBA',(W,H),(0,0,0,0))
items.sort(key=lambda t:(-t[0]['z'], t[0]['depth']))
for n,im,s in items:
    ppu=s['ppu'] or 100
    sw=max(1,int(im.size[0]*abs(n['sx'])*PPU/ppu)); sh=max(1,int(im.size[1]*abs(n['sy'])*PPU/ppu))
    img=im.resize((sw,sh))
    if n['sx']<0: img=img.transpose(Image.FLIP_LEFT_RIGHT)
    if n['sy']<0: img=img.transpose(Image.FLIP_TOP_BOTTOM)
    if abs(n['rot'])>1e-3: img=img.rotate(-math.degrees(n['rot']),expand=True)
    piv=s['pivot'] or {'m_X':0.5,'m_Y':0.5}
    px=(n['x']-minx)*PPU+10; py=(maxy-n['y'])*PPU+10
    ox=px - piv['m_X']*img.size[0]; oy=py-(1-piv['m_Y'])*img.size[1]
    canvas.alpha_composite(img,(int(ox),int(oy)))
canvas.save(sys.argv[3])
print(W,H,len(items),'bounds',minx,maxx,miny,maxy)
