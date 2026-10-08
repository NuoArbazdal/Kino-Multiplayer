// Experimental host-led replication for the original game's Three.js runtime.
// Solo mode stays unchanged when the URL has no room/server parameters.
import * as THREE from 'three';
import { KinoMultiplayer } from './multiplayer.js';

export function attachKinoCoop({scene,camera,getPlayerPosition,getSession,getEnemies,serverUrl,code,name='Joueur'}) {
  if(!serverUrl || !code)return null;
  const net=new KinoMultiplayer(serverUrl);
  const avatars=new Map(), poses=new Map(), shotTimes=new Map();
  const geometry=new THREE.CapsuleGeometry(17,65,4,8);
  const material=new THREE.MeshStandardMaterial({color:0x57b4df,roughness:.8});
  let lastPose=0,lastWorld=0,connected=false,isHost=false,started=false;
  const remove=id=>{const avatar=avatars.get(id);if(avatar){scene.remove(avatar);avatars.delete(id);}poses.delete(id);shotTimes.delete(id);};
  function ensure(id){
    let mesh=avatars.get(id);
    if(!mesh){mesh=new THREE.Mesh(geometry,material);mesh.userData.remotePlayerId=id;scene.add(mesh);avatars.set(id,mesh);}
    return mesh;
  }
  function acceptPose(id,p){
    if(!p||![p.x,p.y,p.z,p.yaw].every(Number.isFinite))return;
    poses.set(id,p);
    const mesh=ensure(id);
    const target=new THREE.Vector3(p.x,p.y+45,p.z);
    if(!mesh.userData.target)mesh.position.copy(target);
    mesh.userData.target=target;mesh.rotation.y=p.yaw;
  }
  net.addEventListener('joined',()=>{connected=true;});
  net.addEventListener('room',e=>{
    isHost=e.detail.host===net.id;started=e.detail.started;
    const active=new Set(e.detail.players.map(p=>p.id));
    for(const id of [...avatars.keys()])if(!active.has(id))remove(id);
    for(const p of e.detail.players)if(p.id!==net.id&&p.pose)acceptPose(p.id,p.pose);
    const enemies=getEnemies();
    if(enemies){enemies.autoSpawn=isHost;enemies.autoRounds=isHost;}
  });
  net.addEventListener('started',()=>{started=true;});
  net.addEventListener('pose',e=>{if(e.detail.id!==net.id)acceptPose(e.detail.id,e.detail.pose);});
  net.addEventListener('left',e=>remove(e.detail.id));
  net.addEventListener('event',e=>{
    if(!started||!isHost||e.detail.event!=='shoot')return;
    const d=e.detail.data,pose=poses.get(e.detail.id),enemies=getEnemies();
    if(!d||!pose||!enemies||!Number.isInteger(d.targetId)||!Number.isFinite(d.damage)||d.damage<=0||d.damage>2000)return;
    const z=enemies.list.find(z=>z.id===d.targetId);if(!z)return;
    if(z.root.position.distanceTo(new THREE.Vector3(pose.x,pose.y,pose.z))>3000)return;
    const now=performance.now(),last=shotTimes.get(e.detail.id)??-Infinity;
    if(now-last<75)return;
    shotTimes.set(e.detail.id,now);
    enemies.hurt(z,d.damage,!!d.head,false,'bullet',false);
  });
  net.addEventListener('world',e=>{
    if(isHost||!started)return;
    const {key,data}=e.detail;
    if(key==='round'&&Number.isInteger(data)&&data>0&&data<=999){
      const session=getSession();if(session)session.round=data;
    }
    if(key!=='zombies'||!Array.isArray(data)||data.length>100)return;
    const enemies=getEnemies();
    if(!enemies?.templates?.length)return;
    enemies.autoSpawn=false;enemies.autoRounds=false;
    const seen=new Set();
    for(const item of data){
      if(!Number.isInteger(item?.id)||item.id<=0||!Array.isArray(item.position)||item.position.length!==3||!item.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100000))continue;
      const kind=['zombie','dog','nova'].includes(item.kind)?item.kind:'zombie';
      seen.add(item.id);
      let z=enemies.list.find(z=>z.id===item.id);
      if(!z){z=enemies.spawn(new THREE.Vector3(...item.position),null,kind);z.id=item.id;}
      z.root.position.fromArray(item.position);
      if(Number.isFinite(item.health))z.health=item.health;
    }
    for(const z of [...enemies.list])if(!seen.has(z.id))enemies.remove(z);
  });
  net.addEventListener('disconnected',()=>{connected=false;started=false;for(const id of [...avatars.keys()])remove(id);});
  net.connect().then(()=>net.join(code,name)).catch(e=>console.warn('Kino coop unavailable:',e));
  return {
    net,
    get isHost(){return isHost;},
    get started(){return started;},
    update(now){
      for(const mesh of avatars.values())if(mesh.userData.target)mesh.position.lerp(mesh.userData.target,.22);
      if(!connected||!started)return;
      if(now-lastPose>=50){
        lastPose=now;
        const p=getPlayerPosition();
        if(p)net.pose(p.x,p.y,p.z,camera.rotation.y);
      }
      if(isHost&&now-lastWorld>=150){
        lastWorld=now;
        const enemies=getEnemies(),session=getSession();
        if(enemies?.snapshot)net.world('zombies',enemies.snapshot().map(z=>({id:z.id,kind:z.kind,health:z.health,position:z.position})));
        if(session)net.world('round',session.round);
      }
    },
    shoot(data){if(connected&&started&&!isHost)net.event('shoot',data);},
    destroy(){net.disconnect();for(const id of [...avatars.keys()])remove(id);geometry.dispose();material.dispose();}
  };
}
