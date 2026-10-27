import sys
room=sys.argv[1]; dx,dy,s=float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]); out=sys.argv[5]
exec(open('match_rooms.py').read().split("def samples")[0])
spr,c=render_room(room,s)
from PIL import Image
b=Image.open('/home/user/among1-2/client/assets/map/skeld.png').convert('RGBA')
o=Image.fromarray(spr.astype('uint8'))
a=np.array(o); a[:,:,3]=(a[:,:,3]*0.55).astype('uint8'); o=Image.fromarray(a)
c2=Image.new('RGBA',b.size,(40,0,40,255)); c2.alpha_composite(b); c2.alpha_composite(o,(int(dx),int(dy)))
bb=Image.fromarray(spr.astype('uint8')).getbbox()
c2.crop((bb[0]-120+int(dx),bb[1]-120+int(dy),bb[2]+120+int(dx),bb[3]+120+int(dy))).convert('RGB').save(out)
