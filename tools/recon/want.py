import pickle,sys,json,os,re
from nodes import world,glb,P
idx=pickle.load(open('sprites.pkl','rb'))
ALIAS=json.load(open(os.environ['ALIAS'])) if os.environ.get('ALIAS') else {}
ts=set()
for n in world(glb(P+sys.argv[1])):
    base=n['name'].split(' (')[0]
    nm=ALIAS.get(n['name'], ALIAS.get(base, n['name'] if n['name'] in idx else base))
    if nm in idx: ts.add(idx[nm][0]['tex'])
json.dump(sorted(ts),open(sys.argv[2] if len(sys.argv)>2 else 'want.json','w')); print(len(ts))
