# 방마다 원작 벽·바닥 스프라이트(기준)를 팬아트 그림 위에서 맞춰 보며 가장 잘 맞는 이동량·배율을 찾는다
# 출력: room_fit.json {방: [dx, dy, s, 오차, 이동 전 오차]}  — 방 기준점(방 노드 위치) 중심으로 s 배 후 (dx,dy) 이동
import sys, os, json, math
sys.argv_rooms=sys.argv[1:] or None
if not sys.argv_rooms: del sys.argv_rooms
sys.argv=['x','SkeldShip.glb','texmap_skeld3.json','/dev/null','^$']
src=open('overlay.py').read()
exec(src.split("nodes=world(glb(P+sys.argv[1]))")[0].split("# 팬아트")[0])
import numpy as np
from PIL import Image
AX,BX,AY,BY=98.9,1977.9,-94.5,609.7
K=(abs(AX)+abs(AY))/2/100
ALIAS=json.load(open('alias_skeld.json'))
GROUND={'Electrical':{'Ground':'room_electrical'},'Medical':{'Ground':'room_med'},'LeftEngine':{'Ground':'room_LEng'},'RightEngine':{'Ground':'room_REng'},'LifeSupport':{'Ground':'room_lifeSupport'},'Security':{'Ground':'room_security'},'Cafeteria':{'Ground':'room_cafeteria'}}
ANCH={
 'Admin':['admin_walls','admin_walltop','admin_bridge'],
 'Cockpit':['nav_walls.png'],
 'Weapons':['weap_platform','weap_wall','weap_walltop'],
 'Shields':['shields_floor'],
 'Electrical':[],
 'Reactor':['reactor_ceiling','reactor_wall'],
 'Storage':['storage_Boxes'],
 'Comms':['comms_walls','comms_wallstuff'],
 'Medical':[], 'LeftEngine':[], 'RightEngine':[], 'LifeSupport':[], 'Security':[], 'Cafeteria':[],
}
base=np.array(Image.open('/home/user/among1-2/client/assets/map/skeld.png').convert('RGBA')).astype(np.float32)
H,W=base.shape[:2]
nodes=world(glb(P+'SkeldShip.glb'))
def render_room(room, s):
  """방 기준 노드들을 s 배로 그린 RGBA (팬아트 좌표, 방 중심 기준 확대)"""
  rn=[n for n in nodes if n['path'].split('/')[2:3]==[room] and n['depth']==1][0]
  cx,cy=AX*rn['x']+BX, AY*rn['y']+BY
  can=Image.new('RGBA',(W,H),(0,0,0,0))
  spec=ANCH[room]
  items=[n for n in nodes if n['path'].startswith('/SkeldShip/'+room+'/') and (n['name'] in spec or (n['name'] in GROUND.get(room,{}) and n['depth']==2))]
  items.sort(key=lambda n:(-n['z'],n['depth']))
  for n in items:
    im,sp=sprite_img(GROUND.get(room,{}).get(n['name'],n['name']) if n['depth']==2 else n['name'])
    if im is None: continue
    ppu=sp['ppu'] or 100
    sw=max(1,int(im.size[0]*abs(n['sx'])*K*100/ppu*s)); sh=max(1,int(im.size[1]*abs(n['sy'])*K*100/ppu*s))
    img=im.resize((sw,sh),Image.LANCZOS)
    piv=sp['pivot'] or {'m_X':0.5,'m_Y':0.5}
    px=cx+(AX*n['x']+BX-cx)*s; py=cy+(AY*n['y']+BY-cy)*s
    can.alpha_composite(img,(int(px-piv['m_X']*sw),int(py-(1-piv['m_Y'])*sh)))
  return np.array(can).astype(np.float32), (cx,cy)
def samples(spr, n=None):
  a=spr[:,:,3]>200
  ys,xs=np.nonzero(a)
  if n and len(ys)>n:
    sel=np.random.RandomState(0).choice(len(ys),n,replace=False); ys,xs=ys[sel],xs[sel]
  return ys,xs,spr[ys,xs,:3]
def score(smp, dx, dy):
  ys,xs,col=smp
  ys2,xs2=ys+dy,xs+dx
  ok=(ys2>=0)&(ys2<H)&(xs2>=0)&(xs2<W)
  b=base[ys2[ok],xs2[ok]]
  vis=b[:,3]>128
  if vis.sum()<200: return 1e9
  return float(np.abs(b[vis,:3]-col[ok][vis]).mean())
ROOMS=sys.argv_rooms if hasattr(sys,'argv_rooms') else list(ANCH)
RNG=int(os.environ.get('RNG','100'))
out=json.load(open('room_fit.json')) if os.path.exists('room_fit.json') else {}
for room in ROOMS:
  best=None
  for s in [0.9,0.94,0.98,1.0,1.02,1.05,1.08,1.12]:
    spr,c=render_room(room,s)
    smp=samples(spr,5000)
    if len(smp[0])<500: continue
    for dy in range(-RNG,RNG+1,4):
      for dx in range(-RNG,RNG+1,4):
        e=score(smp,dx,dy)
        if best is None or e<best[3]: best=[dx,dy,s,e]
  dx,dy,s,e=best
  spr,c=render_room(room,s); smp=samples(spr)
  best[3]=score(smp,dx,dy)
  for ddy in range(-4,5):
    for ddx in range(-4,5):
      e2=score(smp,dx+ddx,dy+ddy)
      if e2<best[3]: best=[dx+ddx,dy+ddy,s,e2]
  spr0,_=render_room(room,1.0)
  best.append(score(samples(spr0),0,0))
  out[room]=best; print(room,[round(v,2) for v in best],flush=True)
json.dump(out,open('room_fit.json','w'),indent=0)
