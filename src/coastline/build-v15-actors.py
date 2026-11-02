import bpy,os,re,math
from mathutils import Vector,Quaternion
base=os.path.abspath('.')
body={'Bip01 Pelvis':'Hips','Bip01 Spine':'Spine','Bip01 Spine1':'Chest','Bip01 Spine2':'UpperChest','Bip01 Neck':'Neck','Bip01 Head':'Head'}
for s in ['L','R']:
 for a,b in {'Clavicle':'Shoulder','UpperArm':'UpperArm','Forearm':'LowerArm','Hand':'Wrist','Thigh':'UpperLeg','Calf':'LowerLeg','Foot':'Foot','Toe0':'Toe'}.items():body['Bip01 '+s+' '+a]=b+s
mix={'Hips':'Hips','Spine':'Spine','Spine1':'Chest','Spine2':'UpperChest','Neck':'Neck','Head':'Head'}
for s,long in [('L','Left'),('R','Right')]:
 for a,b in {'Shoulder':'Shoulder','Arm':'UpperArm','ForeArm':'LowerArm','Hand':'Wrist','UpLeg':'UpperLeg','Leg':'LowerLeg','Foot':'Foot','ToeBase':'Toe'}.items():mix[long+a]=b+s
pairs=[('Hips','Spine'),('Spine','Chest'),('Chest','UpperChest'),('UpperChest','Neck'),('Neck','Head')]
for s in ['L','R']:pairs += [('Shoulder'+s,'UpperArm'+s),('UpperArm'+s,'LowerArm'+s),('LowerArm'+s,'Wrist'+s),('UpperLeg'+s,'LowerLeg'+s),('LowerLeg'+s,'Foot'+s),('Foot'+s,'Toe'+s)]
for char in ['Male_Adult_01','Male_Adult_10','Male_Adult_16','Female_Adult_07','police']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 if char=='police':bpy.ops.import_scene.gltf(filepath=base+'/v15-sources/cops/police.glb')
 else:bpy.ops.import_scene.fbx(filepath=base+'/v15-sources/civilians/'+char+'/Export/'+char+'.fbx')
 target=next(o for o in bpy.data.objects if o.type=='ARMATURE');orig=set(bpy.data.objects)
 for o in orig:
  o.animation_data_clear()
  if o.type=='ARMATURE':
   for b in o.pose.bones:b.matrix_basis.identity()
 for b in target.data.bones:
  if char=='police':name=re.sub(r'_\d+$','',b.name.split(':')[-1]);b.name=mix.get(name,b.name)
  else:b.name=body.get(b.name,b.name)
 for m in bpy.data.materials:
  if not m.use_nodes:continue
  bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if bs:bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=.75
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE' and n.image:
    if char!='police':
     fn=os.path.basename(n.image.filepath);p=base+'/v15-sources/civilians/'+char+'/Textures/'+fn
     if os.path.isfile(p):n.image.filepath=p;n.image.reload()
     else:
      for link in list(n.outputs['Color'].links):m.node_tree.links.remove(link)
      continue
    n.image.scale(512,512)
 # source realistic body mocap shared world-space directions, preserving target's bind basis.
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=base+'/public/assets/real-human.glb');new=set(bpy.data.objects)-before
 src=next(o for o in new if o.type=='ARMATURE')
 actions={a.name.split('_')[0]:a for a in bpy.data.actions if a.name.startswith(('Idle','Walk','Run'))}
 print('SOURCEACTIONS',[(a.name,a.frame_range[:]) for a in actions.values()])
 target.animation_data_create()
 for name in ['Idle','Walk','Run']:
  action=next(a for a in bpy.data.actions if a.name.startswith(name) and len(a.fcurves)>20)
  src.animation_data_create();src.animation_data.action=action
  a=bpy.data.actions.new('Retarget'+name);target.animation_data.action=a
  start,end=map(int,action.frame_range)
  for frame in range(start,end+1,2):
   bpy.context.scene.frame_set(frame)
   for b in target.pose.bones:b.matrix_basis.identity()
   bpy.context.view_layer.update()
   for bn,cn in pairs:
    b=target.pose.bones.get(bn);c=target.pose.bones.get(cn);sb=src.pose.bones.get(bn);sc=src.pose.bones.get(cn)
    if not all([b,c,sb,sc]):continue
    bpy.context.view_layer.update()
    v=(target.matrix_world@c.head)-(target.matrix_world@b.head);d=(src.matrix_world@sc.head)-(src.matrix_world@sb.head)
    if v.length<.000001 or d.length<.000001:continue
    delta=v.normalized().rotation_difference(d.normalized()).to_matrix().to_4x4()
    b.matrix=target.matrix_world.inverted()@delta@target.matrix_world@b.matrix
   for b in target.pose.bones:
    b.rotation_mode='QUATERNION';b.keyframe_insert('rotation_quaternion',frame=frame-start+1,group=b.name)
  target.animation_data.action=None;a.name=name
  track=target.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,a)
 for o in new:bpy.data.objects.remove(o,do_unlink=True)
 for o in orig:
  if o.type=='MESH' and char=='police':
   bpy.context.view_layer.objects.active=o
   mod=o.modifiers.new('MobileLOD','DECIMATE');mod.ratio=.55;bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in orig:
  if o.type in ['MESH','ARMATURE']:o.select_set(True)
 bpy.context.view_layer.objects.active=target
 bpy.ops.export_scene.gltf(filepath=base+'/public/assets/npc-'+char.lower()+'.glb',use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_image_format='AUTO')
 print('EXPORTED',char)
