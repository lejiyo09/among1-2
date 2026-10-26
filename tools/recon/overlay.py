# 프리팹 노드 위치 + 스프라이트로 맵 재조립 (원작 단위 1 = 100px, PPU)
import pickle,json,sys,os,math,re
from PIL import Image
from nodes import world,glb,P
T=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/Texture2D/'
idx=pickle.load(open('sprites.pkl','rb'))
texmap={int(k):v[1] for k,v in json.load(open(sys.argv[2])).items() if v}
pngs=set(os.listdir(T))

cache={}
BYTEX={}
_seen=set()
for _n,_l in idx.items():
    for _s in _l:
        k=(_s['tex'],_s['rect']['m_X'],_s['rect']['m_Y'],_s['rect']['m_Width'])
        if k in _seen: continue
        _seen.add(k); BYTEX.setdefault(_s['tex'],[]).append(_s)

import base64,struct
SPR=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/Sprite/'
def mesh_mask(name,s,size):
    """원작 스프라이트 메시(꼭짓점 + 삼각형)로 잘라 낸다. 사각형 영역에 끼어 든 옆 스프라이트 조각을 없앤다"""
    p=SPR+name+'.json'
    if not os.path.exists(p): return None
    d=json.load(open(p)); rd=d['m_RD']; vd=rd['m_VertexData']
    n=vd['m_VertexCount']; raw=base64.b64decode(vd['m_Data'] or '')
    ib=base64.b64decode(rd['m_IndexBuffer'] or '')
    if n<3 or len(raw)<n*12 or len(ib)<6: return None
    pos=[struct.unpack_from('<3f',raw,i*12) for i in range(n)]
    idxs=struct.unpack('<%dH'%(len(ib)//2),ib)
    w,h=size; ppu=d.get('m_PixelsToUnits') or 100; pv=d['m_Pivot']
    pts=[(x*ppu+pv['m_X']*w, h-(y*ppu+pv['m_Y']*h)) for x,y,_ in pos]
    from PIL import ImageDraw
    m=Image.new('L',size,0); dr=ImageDraw.Draw(m)
    for i in range(0,len(idxs)-2,3):
        dr.polygon([pts[idxs[i]],pts[idxs[i+1]],pts[idxs[i+2]]],fill=255)
    return m
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
    m=mesh_mask(name,s,out.size)
    if m is not None:
        out=out.copy(); a=out.split()[3]
        from PIL import ImageChops
        out.putalpha(ImageChops.multiply(a,m))
        return out,s
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

# 팬아트 스켈드 좌표 변환 (벤트·비상 버튼 15곳으로 최소제곱 맞춤): X = AX*u + BX, Y = AY*v + BY
AX,BX,AY,BY=[float(v) for v in os.environ.get('FIT','98.9,1977.9,-94.5,609.7').split(',')]
K=(abs(AX)+abs(AY))/2/100   # 스프라이트 배율 (원작 PPU 100 기준)
INC=re.compile(sys.argv[4]); EXC=re.compile(sys.argv[5]) if len(sys.argv)>5 and sys.argv[5] else None
ROOMOFF=json.load(open(os.environ['ROOMOFF'])) if os.environ.get('ROOMOFF') else {}
nodes=world(glb(P+sys.argv[1]))
ALIAS=json.load(open(os.environ['ALIAS'])) if os.environ.get('ALIAS') else {}
items=[]
for n in nodes:
    if not INC.search(n['path']) or (EXC and EXC.search(n['path'])): continue
    base=n['name'].split(' (')[0]
    nm=ALIAS.get(n['name'], ALIAS.get(base, n['name'] if n['name'] in idx else base))
    if nm not in idx: continue
    im,s=sprite_img(nm)
    if im is None: print('no tex',nm); continue
    items.append((n,im,s))
OX,OY=int(os.environ.get('PADX','400')),int(os.environ.get('PADY','200'))
W,H=3587+OX*2,2064+OY*2
canvas=Image.new('RGBA',(W,H),(0,0,0,0))
items.sort(key=lambda t:(-t[0]['z'], t[0]['depth']))
BOXES=[]
for n,im,s in items:
    ppu=s['ppu'] or 100
    sw=max(1,int(im.size[0]*abs(n['sx'])*K*100/ppu)); sh=max(1,int(im.size[1]*abs(n['sy'])*K*100/ppu))
    img=im.resize((sw,sh),Image.LANCZOS)
    if n['sx']<0: img=img.transpose(Image.FLIP_LEFT_RIGHT)
    if n['sy']<0: img=img.transpose(Image.FLIP_TOP_BOTTOM)
    if abs(n['rot'])>1e-3: img=img.rotate(-math.degrees(n['rot']),expand=True,resample=Image.BICUBIC)
    piv=s['pivot'] or {'m_X':0.5,'m_Y':0.5}
    room=n['path'].split('/')[2] if n['path'].count('/')>=2 else ''
    dx,dy=ROOMOFF.get(room,[0,0])
    px=AX*n['x']+BX+OX+dx; py=AY*n['y']+BY+OY+dy
    ox_,oy_=int(px-piv['m_X']*img.size[0]),int(py-(1-piv['m_Y'])*img.size[1])
    canvas.alpha_composite(img,(ox_,oy_))
    bb=img.getbbox()
    if bb: BOXES.append((n['path'],ox_+bb[0]-OX,oy_+bb[1]-OY,ox_+bb[2]-OX,oy_+bb[3]-OY))
canvas.save(sys.argv[3])
if os.environ.get('BBOX'): json.dump(BOXES,open(os.environ['BBOX'],'w'),indent=0)
print('items',len(items),'canvas',W,H,'pad',OX,OY)
