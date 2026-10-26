import json,struct,pickle,math,collections,sys
import os
P=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/PrefabHierarchyObject/'
def glb(path):
    b=open(path,'rb').read(); clen=struct.unpack('<I',b[12:16])[0]; return json.loads(b[20:20+clen])
def quat_z(q):  # rotation about z (2D)
    x,y,z,w=q; return math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))
def world(j):
    out=[]
    def walk(i,tx,ty,tz,sx,sy,rot,depth,path):
        n=j['nodes'][i]
        t=n.get('translation',[0,0,0]); s=n.get('scale',[1,1,1]); r=quat_z(n['rotation']) if 'rotation' in n else 0
        # 부모 변환 적용 (2D)
        lx,ly=t[0]*sx,t[1]*sy
        c,si=math.cos(rot),math.sin(rot)
        wx=tx+lx*c-ly*si; wy=ty+lx*si+ly*c; wz=tz+t[2]
        nsx,nsy=sx*s[0],sy*s[1]; nr=rot+r
        out.append(dict(i=i,name=n['name'],x=-wx,y=wy,z=wz,sx=nsx,sy=nsy,rot=nr,depth=depth,path=path+'/'+n['name']))
        for c2 in n.get('children',[]): walk(c2,wx,wy,wz,nsx,nsy,nr,depth+1,path+'/'+n['name'])
    walk(j['scenes'][0]['nodes'][0] if 'scenes' in j else 0,0,0,0,1,1,0,0,'')
    return out
if __name__=='__main__':
    f=sys.argv[1]
    idx=pickle.load(open('sprites.pkl','rb'))
    nodes=world(glb(P+f))
    hit=[n for n in nodes if n['name'] in idx]
    miss=collections.Counter(n['name'] for n in nodes if n['name'] not in idx)
    print(len(nodes),'matched',len(hit))
    print('top missing',miss.most_common(40))
    texs=collections.Counter(idx[n['name']][0]['tex'] for n in hit)
    print('textures',len(texs))
