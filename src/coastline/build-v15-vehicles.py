import bpy,os,math,bmesh,json
from mathutils import Vector,Matrix
pairs={'car-concept':('cars/coupe',4.65),'suv-luxury':('cars/suv',4.9),'delivery':('cars/minivan',5.0),'truck':('cars/pickup',5.35),'milk-truck':('cars/minivan',5.1),'sedan':('cars/sedan',4.7),'sedan-sports':('cars/compact',4.45),'hatchback-sports':('cars/hatchback',4.2),'taxi':('taxis/taxi',4.85),'police-car':('police/police_car',5.25)}
out={}
for name,(file,length) in pairs.items():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=os.path.abspath('v15-sources/'+file+'.glb'))
 for o in bpy.data.objects:
  o.animation_data_clear()
 meshes=[o for o in bpy.data.objects if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.convert(target='MESH')
 # Discard unreferenced vertices from mirrored source accessors before measuring.
 for o in meshes:
  bm=bmesh.new();bm.from_mesh(o.data);loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(o.data);bm.free();o.data.update()
 bpy.context.view_layer.update()
 # remove parenting while retaining current world matrices.
 for o in meshes:
  matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
 bounds=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];mins=Vector(tuple(min(v[i] for v in bounds) for i in range(3)));maxs=Vector(tuple(max(v[i] for v in bounds) for i in range(3)));dim=maxs-mins
 # Blender +Z up, vehicle length should point along -Y (glTF +Z).
 rotate=Matrix.Rotation(math.pi/2,4,'Z') if dim.x>dim.y else Matrix.Identity(4)
 for o in meshes:o.matrix_world=rotate@o.matrix_world
 bounds=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];mins=Vector(tuple(min(v[i] for v in bounds) for i in range(3)));maxs=Vector(tuple(max(v[i] for v in bounds) for i in range(3)));dim=maxs-mins
 scale=length/dim.y;offset=Vector((-(mins.x+maxs.x)/2,-(mins.y+maxs.y)/2,-mins.z))
 for o in meshes:
  o.matrix_world=Matrix.Scale(scale,4)@Matrix.Translation(offset)@o.matrix_world
  if name=="car-concept":o.matrix_world=Matrix.Diagonal((2.0/(dim.x*scale),1,1,1))@o.matrix_world
  bpy.context.view_layer.objects.active=o
  if name=='police-car' and len(o.data.polygons)>500:
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
   mod=o.modifiers.new('MobileSimplify','DECIMATE');mod.ratio=.10;bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.abspath('public/assets/'+name+'.glb'),use_selection=True,export_format='GLB',export_animations=False)
 out[name]={'length':length,'width':2.0 if name=='car-concept' else dim.x*scale,'height':dim.z*scale,'sourceFile':file+'.glb'};print('VEHICLE',name,out[name])
open('vehicle-dimensions-v1.5.json','w').write(json.dumps(out,indent=2))
