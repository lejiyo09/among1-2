# 텍스처 PathID -> Texture2D PNG 파일 추정 (스프라이트 영역이 모두 들어가고, 그 영역에 실제 픽셀이 있는 PNG)
import pickle,os,sys,collections,json
from PIL import Image
T=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/Texture2D/'
idx=pickle.load(open('sprites.pkl','rb'))
bytex=collections.defaultdict(list)
for name,lst in idx.items():
    for s in lst:
        if s['tex'] and s['rect']: bytex[s['tex']].append(s['rect'])
sizes={}
for f in os.listdir(T):
    if f.endswith('.png'):
        try: sizes[f]=Image.open(T+f).size
        except Exception: pass
cache={}
def alpha(f):
    if f not in cache: cache[f]=Image.open(T+f).convert('RGBA').split()[3]
    return cache[f]
import random,re
# 맵과 무관한 텍스처(꾸미기, 글꼴, 명판, 이벤트)는 후보에서 뺀다
EXCLUDE=re.compile(r'SDF|Atlas|[Nn]ame[Pp]late|^hat_|^pet_|^skin_|^visor_|[Bb]alloon|confetti|Mummy|Nutcracker|Noto|Crit|Pusheen|[Cc]ube|Hololive|HW20|Winter|Bundle|Store|Shop|Plates|Banner|Logo|Kill|Seeker|Horse|Jester|Ghost|PlayerAnim|Dead|Recolor|Icon|eject|Ejection')
def resolve(tex):
    rects=bytex[tex]
    mx=max(r['m_X']+r['m_Width'] for r in rects); my=max(r['m_Y']+r['m_Height'] for r in rects)
    cands=[f for f,(w,h) in sizes.items() if w>=mx and h>=my and w*h <= 4096*4096 and not EXCLUDE.search(f)]
    rnd=random.Random(1)
    best=None
    for f in cands:
        a=alpha(f); W,H=sizes[f]
        boxes=[(int(r['m_X']),int(H-r['m_Y']-r['m_Height']),int(r['m_X']+r['m_Width']),int(H-r['m_Y'])) for r in rects]
        ins=[]; 
        for bx in boxes[:60]:
            if bx[2]-bx[0]<2 or bx[3]-bx[1]<2: continue
            hist=list(a.crop(bx).resize((8,8)).getdata())
            ins.append(sum(1 for v in hist if v>20)/64)
        if not ins: continue
        inside=sum(ins)/len(ins)
        px=a.load(); outs=[]; tries=0
        while len(outs)<300 and tries<3000:
            tries+=1
            x=rnd.randrange(W); y=rnd.randrange(H)
            if any(b[0]<=x<b[2] and b[1]<=y<b[3] for b in boxes): continue
            outs.append(1 if px[x,y]>20 else 0)
        outside=sum(outs)/len(outs) if outs else 0
        sc=inside-outside
        if not best or sc>best[0]: best=(round(sc,3),f,round(inside,2),round(outside,2))
    return best
if __name__=='__main__':
    want=json.load(open(sys.argv[1]))
    out={}
    for t in want:
        out[str(t)]=resolve(t)
        print(t,out[str(t)],flush=True)
    json.dump(out,open(sys.argv[2],'w'))
