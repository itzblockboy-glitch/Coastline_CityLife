import bpy,os,math,json
from mathutils import Quaternion, Matrix
base=os.path.abspath('visual-sources/rocketbox')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=base+'/Export/Male_Adult_06.fbx')
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');original=set(bpy.data.objects)
print('TARGETTRANSFORM',rig.rotation_euler[:],rig.location[:],rig.scale[:])
# Resolve original source textures and use physically plausible skin/cloth, not FBX flat material tint.
for m in bpy.data.materials:
 if not m.use_nodes:continue
 bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=.73
 for n in m.node_tree.nodes:
  if n.type=='TEX_IMAGE' and n.image:
   p=base+'/Textures/'+os.path.basename(n.image.filepath).replace('.tga','.png');n.image.filepath=p;n.image.reload()
   n.image.scale(1024,1024)
 # Remove old specular-color wiring; eye/hair alpha retained.
 for link in list(m.node_tree.links):
  if link.to_node==bs and link.to_socket.name in ['Specular IOR Level','Specular Tint']:m.node_tree.links.remove(link)
 if 'opacity' in m.name:bs.inputs['Roughness'].default_value=.85
# Copy actual absolute biped pose rotations into target rest basis; omit root motion / scaling.
for filename,name in [('m_idle_neutral_01','Idle'),('m_walk_neutral','Walk'),('m_run_neutral','Run'),('m_sit_chair_idle_neutral_01','Sit')]:
 before=set(bpy.data.objects);bpy.ops.import_scene.fbx(filepath=base+'/anims/'+filename+'.fbx');new=set(bpy.data.objects)-before
 src=next(o for o in new if o.type=='ARMATURE');action=src.animation_data.action;start,end=map(int,action.frame_range)
 # sample idle first 3 seconds, other cycles full; reduce 30fps to15fps
 end=min(end,start+90) if name in ['Idle','Sit'] else end
 a=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=a
 for fr in range(start,end+1,2):
  bpy.context.scene.frame_set(fr)
  for b in rig.pose.bones:
   if b.name not in src.pose.bones:continue
   desired=src.pose.bones[b.name].matrix.to_quaternion().to_matrix().to_4x4()
   rest=b.bone.matrix_local.to_quaternion().to_matrix().to_4x4()
   if b.parent:
    pr=b.parent.bone.matrix_local.to_quaternion().to_matrix().to_4x4()
    ps=src.pose.bones[b.parent.name].matrix.to_quaternion().to_matrix().to_4x4()
    basis=(pr.inverted()@rest).inverted()@ps.inverted()@desired
   else:basis=rest.inverted()@desired
   b.rotation_mode='QUATERNION';b.rotation_quaternion=basis.to_quaternion();b.keyframe_insert('rotation_quaternion',frame=fr-start+1,group=b.name)
 for o in new:bpy.data.objects.remove(o,do_unlink=True)
 rig.animation_data.action=None
 for b in rig.pose.bones:b.rotation_quaternion=Quaternion()
 track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,a)
# glTF all NLA tracks exported as independent actions.
bpy.ops.object.select_all(action='DESELECT')
for o in original:
 if o.type in ['ARMATURE','MESH']:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.scene.frame_set(1)
bpy.ops.export_scene.gltf(filepath=os.path.abspath('public/assets/real-human.glb'),use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_image_format='AUTO',export_force_sampling=True,export_optimize_animation_size=True,export_skins=True)
