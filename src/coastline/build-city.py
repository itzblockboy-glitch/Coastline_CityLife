import bpy,os,math,bmesh
from mathutils import Matrix,Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
allroots=[]
def cube(name,loc,scale,material,group):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material);group.append(o);return o
for kind,variants in [('modular_urban_apartments_facade',[('a',3),('b',4),('c',6),('d',8)]),('modular_factory_facade',[('e',2),('f',3)])]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=os.path.abspath('visual-sources/'+kind+'/'+kind+'.gltf'));sources=list(set(bpy.data.objects)-before);lookup={o.name:o for o in sources};ap=kind.startswith('modular_urban')
 # choose source tiles with physical inset windows; preserve planar holes.
 wall=lookup['wall_window_centered_small_03' if ap else 'wall_window_standard_01'] if ap or 'wall_window_standard_01' in lookup else next(o for o in sources if o.name.startswith('wall_window') and abs(o.dimensions.x-3)<.05 and o.dimensions.y<.3)
 win=lookup['window_centered_small_03'] if ap else next(o for o in sources if o.name.startswith('window_') and abs(o.location.x-wall.location.x)<.01 and abs(o.location.y-wall.location.y)<.01 and abs(o.location.z-wall.location.z)<.01)
 dwall=lookup['wall_door_centered_small_02' if ap else 'wall_door_centered_small_01'];door=lookup['door_centered_small_02' if ap else 'door_centered_small_01']
 crown=lookup['cornice_standard_standard_01' if ap else 'cornice01_standard_standard_01']
 print('TILES',kind,wall.name,win.name)
 roofmat=bpy.data.materials.new('WeatheredRoof_'+kind);roofmat.diffuse_color=(.18,.18,.17,1);roofmat.use_nodes=True;roofmat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.92
 cache={}
 def tile(src,loc,angle,low=False):
  o=src.copy();o.data=src.data.copy();bpy.context.collection.objects.link(o)
  # imported source component's geometry stays local; author placement is a catalogue layout.
  o.matrix_world=Matrix.Translation(Vector(loc))@Matrix.Rotation(angle,4,'Z')@src.matrix_world.to_quaternion().to_matrix().to_4x4()@Matrix.Diagonal((*src.scale,1))
  key=(src.name,low)
  if key in cache:
   o.data=cache[key]
  else:
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
   bpy.context.view_layer.objects.active=o;o.select_set(True)
   mod=o.modifiers.new('RemoveCoplanar','DECIMATE');mod.decimate_type='DISSOLVE';mod.angle_limit=.025
   bpy.ops.object.modifier_apply(modifier=mod.name)
   if len(o.data.polygons)>90:
    mod=o.modifiers.new('MobileSimplify','DECIMATE');mod.ratio=.10 if low else .35
    bpy.ops.object.modifier_apply(modifier=mod.name)
   for poly in o.data.polygons: poly.use_smooth=False
   if o.data.has_custom_normals: o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
   cache[key]=o.data
  o.select_set(False);return o
 for letter,floors in variants:
  for low in [False,True]:
   group=[]
   for side in range(4):
    angle=side*math.pi/2;R=Matrix.Rotation(angle,3,'Z')
    for level in range(floors):
     for col in range(4):
      v=R@Vector((-3+col*3,-6,level*3))
      useDoor=side==0 and level==0 and col==1
      group.extend([tile(dwall if useDoor else wall,v,angle,low),tile(door if useDoor else win,v,angle,low)])
    for col in range(4):group.append(tile(crown,R@Vector((-3+col*3,-6,floors*3)),angle,low))
   cube('Roof',(0,0,floors*3-.1),(12,12,.2),roofmat,group)
   # low roof parapets and rooftop plant silhouettes.
   for s in [-1,1]:
    cube('Parapet',(s*5.95,0,floors*3+.15),(.15,12,.45),roofmat,group)
    cube('Parapet',(0,s*5.95,floors*3+.15),(12,.15,.45),roofmat,group)
   cube('RoofPlant',(1,1,floors*3+.45),(2.2,1.6,.9),roofmat,group)
   root=bpy.data.objects.new('city-'+letter+('-low' if low else ''),None);bpy.context.collection.objects.link(root);allroots.append(root)
   # join by material at export: retain shared materials for drawcall instancing.
   bpy.ops.object.select_all(action='DESELECT')
   for o in group:o.select_set(True)
   group[0].data=group[0].data.copy()
   bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object;o.name=root.name+'-Mesh';o.parent=root
   # bake mesh world coordinates for clean +zero root positions
   bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for o in sources:bpy.data.objects.remove(o,do_unlink=True)
# shrink & transcode source maps at export transform stage later.
bpy.ops.export_scene.gltf(filepath=os.path.abspath('public/assets/real-city.glb'),export_format='GLB',export_animations=False,export_image_format='AUTO')
