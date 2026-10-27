# 원작 방 스크린샷(oskarkraak/Among-Us-Maps)을 팬아트 스켈드 위에 맞춘다: 스크린샷 좌표 → 팬아트 좌표 (k 배율, 위치)
import cv2, json, numpy as np, sys
O='/tmp/claude-0/-home-user/e43eee6e-987c-5433-b3ea-2fc12879e3ed/scratchpad/refs/oskarkraak_Among-Us-Maps/res/rooms/'
S='/tmp/claude-0/-home-user-among1-2/e43eee6e-987c-5433-b3ea-2fc12879e3ed/scratchpad/'
REF={'Cafeteria':'skeldCafeteria','Weapons':'skeldWeapons','O2':'skeldO2','Navigation':'skeldNavigation','Shields':'skeldShields','Communications':'skeldCommunication','Storage':'skeldStorage','Admin':'skeldAdmin','Electrical':'skeldElectrical','LowerEngine':'skeldLowerEngine','Security':'skeldSecurity','Reactor':'skeldReactor','UpperEngine':'skeldUpperEngine','MedBay':'skeldMedbay'}
rooms=dict(json.load(open(S+'rooms.json')))
fan=cv2.imread('/home/user/among1-2/client/assets/map/skeld.png',cv2.IMREAD_UNCHANGED)
fg=cv2.cvtColor(fan[:,:,:3],cv2.COLOR_BGR2GRAY); fg[fan[:,:,3]<128]=0
def edges(g): return cv2.Canny(cv2.GaussianBlur(g,(3,3),0),40,120)
out={}
for room in (sys.argv[1:] or REF):
  shot=cv2.imread(O+REF[room]+'.jpg'); sg=cv2.cvtColor(shot,cv2.COLOR_BGR2GRAY)
  x0,y0,x1,y1=rooms[room]; m=20
  crop=fg[max(0,y0-m):y1+m, max(0,x0-m):x1+m]; ox,oy=max(0,x0-m),max(0,y0-m)
  full=crop
  TOP=float(__import__('os').environ.get('TOP','1'))   # 위쪽 일부만 템플릿으로 (엔진처럼 가운데가 크게 가려진 방)
  crop=crop[:int(crop.shape[0]*TOP)]
  best=None
  for k in np.arange(float(__import__("os").environ.get("K0","1.2")),float(__import__("os").environ.get("K1","3.4")),0.02):   # 스크린샷이 팬아트보다 k 배 크다
    t=cv2.resize(crop,None,fx=k,fy=k)
    # 스크린샷을 템플릿보다 크게 여백을 붙여 어느 쪽이 커도 찾을 수 있게
    ph,pw=t.shape[0]+20,t.shape[1]+20
    big=np.zeros((max(ph,sg.shape[0])+ph, max(pw,sg.shape[1])+pw),np.uint8); big[ph//2:ph//2+sg.shape[0], pw//2:pw//2+sg.shape[1]]=sg
    r=cv2.matchTemplate(big,t,cv2.TM_CCOEFF_NORMED); _,v,_,loc=cv2.minMaxLoc(r); loc=(loc[0]-pw//2, loc[1]-ph//2)
    if best is None or v>best[0]: best=(float(v),float(k),loc)
  v,k,(lx,ly)=best
  # 스크린샷 (sx,sy) → 팬아트 (ox + (sx-lx)/k, oy + (sy-ly)/k)
  out[room]={'k':k,'lx':lx,'ly':ly,'ox':ox,'oy':oy,'score':v}
  print(room,round(v,3),round(k,2),flush=True)
  # 확인용 겹침
  inv=cv2.resize(shot,None,fx=1/k,fy=1/k); h,w=full.shape
  sx,sy=int(round(-lx/k)),int(round(-ly/k))
  canvas=np.zeros((h,w,3),np.uint8)
  ys0,xs0=max(0,sy),max(0,sx); ys1,xs1=min(h,sy+inv.shape[0]),min(w,sx+inv.shape[1])
  canvas[ys0:ys1,xs0:xs1]=inv[ys0-sy:ys1-sy, xs0-sx:xs1-sx]
  fanc=fan[max(0,y0-m):y1+m, max(0,x0-m):x1+m,:3]
  blend=cv2.addWeighted(fanc,0.5,canvas,0.5,0)
  cv2.imwrite(S+'align/blend_'+room+'.png',np.hstack([fanc,canvas,blend]))
prev=json.load(open(S+"align/shot_fit.json")); prev.update(out); json.dump(prev,open(S+"align/shot_fit.json","w"),indent=0)
