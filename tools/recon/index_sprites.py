# 스프라이트 json 인덱스: 이름 -> [(파일, texPathID, rect, pivot, ppu)]
import json,os,sys,pickle
A=os.environ.get('AU_ASSETS','../refs/itsssskye_amongus-assets/Assets')+'/Sprite'
idx={}
for i,f in enumerate(os.listdir(A)):
    try:
        d=json.load(open(os.path.join(A,f)))
    except Exception: continue
    name=d.get('m_Name')
    rd=d.get('m_RD',{})
    tex=rd.get('m_Texture',{}).get('m_PathID')
    tr=rd.get('m_TextureRect') or d.get('m_Rect')
    idx.setdefault(name,[]).append(dict(file=f,tex=tex,col=rd.get('m_Texture',{}).get('m_Collection'),rect=tr,pivot=d.get('m_Pivot'),ppu=d.get('m_PixelsToUnits'),offset=rd.get('m_TextureRectOffset'),srect=d.get('m_Rect')))
pickle.dump(idx,open('sprites.pkl','wb'))
print(len(idx))
