# 지금 게임 그림(팬아트+오브젝트+벤트) 과 원작 스크린샷 기준(ref.png)을 같은 좌표로 나란히
import cv2, numpy as np, json, subprocess, sys
R='/tmp/claude-0/-home-user/e43eee6e-987c-5433-b3ea-2fc12879e3ed/scratchpad/recon/'
x0,y0,x1,y1=map(int,sys.argv[1:5]); out=sys.argv[5]
fan=cv2.imread('/home/user/among1-2/client/assets/map/skeld.png',cv2.IMREAD_UNCHANGED)
def over(dst,src,ox,oy):
  h,w=src.shape[:2]; a=src[:,:,3:4]/255.0
  X0,Y0=max(0,ox),max(0,oy); X1,Y1=min(dst.shape[1],ox+w),min(dst.shape[0],oy+h)
  s=src[Y0-oy:Y1-oy,X0-ox:X1-ox]; aa=a[Y0-oy:Y1-oy,X0-ox:X1-ox]
  dst[Y0:Y1,X0:X1]=(dst[Y0:Y1,X0:X1]*(1-aa)+s[:,:,:3]*aa).astype(np.uint8)
can=np.zeros((2064,3587,3),np.uint8); can[:]=(40,0,40)
over(can,fan,0,0)
front=cv2.imread(R+'sk_front.png',cv2.IMREAD_UNCHANGED); over(can,front,-400,-200)
g=cv2.imread('/home/user/among1-2/client/assets/ui/ventgrate.png',cv2.IMREAD_UNCHANGED); g=cv2.resize(g,None,fx=1.1,fy=1.1)
vents=json.loads(subprocess.check_output(['node','-e',"import('/home/user/among1-2/tools/skeld-objects.mjs').then(m=>console.log(JSON.stringify(m.objects.vents.map(v=>[v.x,v.y]))))"]))
for x,y in vents: over(can,g,x-g.shape[1]//2,y-g.shape[0]//2)
ref=cv2.imread('ref.png')
a=can[y0:y1,x0:x1]; b=ref[y0:y1,x0:x1]
for im in (a,b):
  for gx in range((x0//50+1)*50,x1,50): cv2.line(im,(gx-x0,0),(gx-x0,8 if gx%100 else 20),(0,255,255),2)
  for gy in range((y0//50+1)*50,y1,50): cv2.line(im,(0,gy-y0),(8 if gy%100 else 20,gy-y0),(0,255,255),2)
cv2.imwrite(out,np.hstack([a,np.zeros((a.shape[0],8,3),np.uint8),b]))
