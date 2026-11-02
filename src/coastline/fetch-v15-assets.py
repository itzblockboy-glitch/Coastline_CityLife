import requests,os,json,struct,concurrent.futures
root='https://raw.githubusercontent.com/brcdynolab168-bit/City-builder-3d_DEMO/main/src/models/'
paths=['cops/police.glb','cops/female_police.glb','police/police_car.glb','cars/compact.glb','cars/coupe.glb','cars/hatchback.glb','cars/sedan.glb','cars/suv.glb','cars/pickup.glb','cars/minivan.glb','sports/sport_a1.glb','taxis/taxi.glb']
def get(p):
 r=requests.get(root+p);r.raise_for_status();b=r.content;dest='v15-sources/'+p;os.makedirs(os.path.dirname(dest),exist_ok=True);open(dest,'wb').write(b)
 n=struct.unpack('<I',b[12:16])[0];j=json.loads(b[20:20+n]);return p,len(b),j.get('asset'),len(j.get('animations',[])),len(j.get('skins',[]))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for result in ex.map(get,paths):print(json.dumps(result))

for entry in json.load(open('npc-source-files-v1.5.json')):
 os.makedirs(os.path.dirname(entry['save']),exist_ok=True)
 r=requests.get(entry['download']);r.raise_for_status();open(entry['save'],'wb').write(r.content)
# Some mirror GLBs retain nodes bound to meshes with zero primitives (Blender 4.3 import error).
from pathlib import Path
for p in Path('v15-sources').rglob('*.glb'):
 b=p.read_bytes();n=struct.unpack('<I',b[12:16])[0];j=json.loads(b[20:20+n]);empty={i for i,m in enumerate(j.get('meshes',[])) if not m.get('primitives')}
 if not empty:continue
 for node in j.get('nodes',[]):
  if node.get('mesh') in empty:del node['mesh']
 q=json.dumps(j,separators=(',',':')).encode();q+=b' '*((-len(q))%4);tail=b[20+n:]
 p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(q)+len(tail))+struct.pack('<II',len(q),0x4e4f534a)+q+tail)
