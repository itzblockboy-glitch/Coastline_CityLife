import {NodeIO} from '@gltf-transform/core';
const io=new NodeIO(),p='public/assets/real-human.glb',d=await io.read(p);
const map={'Bip01 Pelvis':'Hips','Bip01 Spine':'Spine','Bip01 Spine1':'Chest','Bip01 Spine2':'UpperChest','Bip01 Neck':'Neck','Bip01 Head':'Head'};
for(const s of ['L','R'])for(const [a,b] of Object.entries({'Clavicle':'Shoulder','UpperArm':'UpperArm','Forearm':'LowerArm','Hand':'Wrist','Thigh':'UpperLeg','Calf':'LowerLeg','Foot':'Foot','Toe0':'Toe'}))map['Bip01 '+s+' '+a]=b+s;
for(const n of d.getRoot().listNodes())if(map[n.getName()])n.setName(map[n.getName()]);
console.log('clips',d.getRoot().listAnimations().map(a=>[a.getName(),a.listChannels().length]));
await io.write(p,d);
// package lamp from downloaded glTF as offline GLB.
const lamp=await io.read('visual-sources/street_lamp_01/street_lamp_01.gltf');await io.write('public/assets/street-lamp.glb',lamp);
