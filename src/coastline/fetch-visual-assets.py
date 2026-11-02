import json,os,requests,concurrent.futures
jobs=[]
for k in ['modular_urban_apartments_facade','modular_factory_facade','street_lamp_01']:
 j=json.load(open(k+'-files.json'))['gltf']['1k']['gltf'];root='visual-sources/'+k+'/'
 jobs.append((j['url'],root+k+'.gltf'))
 for p,v in j.get('include',{}).items(): jobs.append((v['url'],root+p))
root='https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Animations/'
for folder,an in [('static','m_idle_neutral_01'),('xy','m_walk_neutral'),('xy','m_run_neutral'),('static','m_sit_chair_idle_neutral_01')]:
 p='all_animations_max_motextr_'+folder+'/'+an+'.max.fbx';jobs.append((root+p,'visual-sources/rocketbox/anims/'+an+'.fbx'))
# MIT realistic protagonist: original FBX plus source textures.
rocket='https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/'
base='Assets/Avatars/Adults/Male_Adult_06/'
jobs.append((rocket+base+'Export/Male_Adult_06.fbx','visual-sources/rocketbox/Export/Male_Adult_06.fbx'))
for filename in ['m011_body_color','m011_body_normal','m011_body_specular','m011_head_color','m011_head_normal','m011_head_specular','m011_opacity_color']:
 jobs.append((rocket+base+'Textures/'+filename+'.tga','visual-sources/rocketbox/Textures/'+filename+'.tga'))
jobs.append(('https://raw.githubusercontent.com/ahmednnz85-debug/Sinz/main/palm.glb','visual-sources/real-palm.glb'))
def get(job):
 url,p=job;os.makedirs(os.path.dirname(p),exist_ok=True)
 r=requests.get(url);r.raise_for_status();open(p,'wb').write(r.content);return p,len(r.content)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for p,s in ex.map(get,jobs):print(p,s)

# build-human.py uses small PNG source maps; requires Pillow.
from PIL import Image
from pathlib import Path
for p in Path('visual-sources/rocketbox/Textures').glob('*.tga'):
 im=Image.open(p);im.thumbnail((1024,1024));im.save(p.with_suffix('.png'));p.unlink()
