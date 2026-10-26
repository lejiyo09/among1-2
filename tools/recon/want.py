import pickle,sys,json
import os
from nodes import world,glb,P
idx=pickle.load(open('sprites.pkl','rb'))
ts=set()
for f in sys.argv[1:]:
    for n in world(glb(P+f)):
        if n['name'] in idx: ts.add(idx[n['name']][0]['tex'])
json.dump(sorted(ts),open('want.json','w')); print(len(ts))
