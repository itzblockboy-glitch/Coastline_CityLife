import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const name of ['real-human','real-city']){
const path='public/assets/'+name+'.glb',d=await io.read(path);
await d.transform(prune(),dedup(),weld(),textureCompress({encoder:sharp,targetFormat:'jpeg',quality:83,resize:[1024,1024],slots: /^(?!normalTexture).*$/}),textureCompress({encoder:sharp,targetFormat:'jpeg',quality:85,resize:[512,512],slots:/normalTexture/}));
await io.write(path,d);
console.log(name,d.getRoot().listTextures().map(t=>[t.getName(),t.getMimeType(),t.getSize()]));
for(const n of d.getRoot().listNodes().filter(n=>n.getName().startsWith('city-'))){let tri=0;n.traverse(v=>v.getMesh()?.listPrimitives().forEach(p=>tri+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3));console.log(n.getName(),Math.round(tri));}
}
