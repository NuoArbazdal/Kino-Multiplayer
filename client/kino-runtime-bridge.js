// Attach this bridge from the original export/web/game.js, after scene and camera are created.
// This module never changes the solo game when no server URL is supplied.
import * as THREE from 'three';
import { KinoMultiplayer } from './multiplayer.js';

export function attachKinoCoop({scene,camera,getPlayerPosition,getSession,getEnemies,getWorld,serverUrl,code,name='Joueur'}) {
  if(!serverUrl || !code) return null;
  const net=new KinoMultiplayer(serverUrl);
  const avatars=new Map();
  const geometry=new THREE.CapsuleGeometry(17,65,4,8);
  const material=new THREE.MeshStandardMaterial({color:0x57b4df,roughness:.8});
  let lastSent=0, lastWorld=0, connected=false, isHost=false;
  function remove(id){const mesh=avatars.get(id);if(mesh){scene.remove(mesh);avatars.delete(id);}}
  function ensure(id){let mesh=avatars.get(id);if(!mesh){mesh=new THREE.Mesh(geometry,material);mesh.userData.remotePlayerId=id;scene.add(mesh);avatars.set(id,mesh);}return mesh;}
  net.addEventListener('joined',()=>{connected=true;});
  net.addEventListener('room',e=>{isHost=e.detail.host===net.id;const active=new Set(e.detail.players.map(p=>p.id));for(const id of avatars.keys())if(!active.has(id))remove(id);for(const p of e.detail.players)if(p.id!==net.id&&p.pose){const m=ensure(p.id);m.position.set(p.pose.x,p.pose.y+45,p.pose.z);m.rotation.y=p.pose.yaw;}});
  net.addEventListener('pose',e=>{if(e.detail.id===net.id)return;const p=e.detail.pose;const m=ensure(e.detail.id);m.userData.target=new THREE.Vector3(p.x,p.y+45,p.z);m.rotation.y=p.yaw;});
  net.addEventListener('left',e=>remove(e.detail.id));
  net.addEventListener('world',e=>{
    const {key,data}=e.detail;
    if(key==='round'&&Number.isInteger(data)&&data>0){const s=getSession();if(s&&s.round!==data)s.round=data;}
    if(key==='zombies' && !isHost && Array.isArray(data)) {\n      const enemies=getEnemies();\n      if(!enemies?.templates?.length)return;\n      enemies.autoSpawn=false;enemies.autoRounds=false;\n      const seen=new Set();\n      for(const item of data){\n        if(!Number.isInteger(item.id)||!Array.isArray(item.position)||item.position.length!==3||!item.position.every(Number.isFinite))continue;\n        seen.add(item.id);\n        let z=enemies.list.find(z=>z.id===item.id);\n        if(!z){z=enemies.spawn(new THREE.Vector3(...item.position),null,['zombie','dog','nova'].includes(item.kind)?item.kind:'zombie');z.id=item.id;}\n        z.root.position.fromArray(item.position);z.health=item.health;\n      }\n      for(const z of [...enemies.list])if(!seen.has(z.id))enemies.remove(z);\n    }
  });
  net.addEventListener('disconnected',()=>{connected=false;for(const id of [...avatars.keys()])remove(id);});
  net.connect().then(()=>net.join(code,name)).catch(e=>console.warn('Kino coop connection failed',e));
  return {
    net,
    update(now){
      for(const mesh of avatars.values())if(mesh.userData.target)mesh.position.lerp(mesh.userData.target,.22);
      if(!connected||now-lastSent<50)return;
      lastSent=now;
      const p=getPlayerPosition();if(!p)return;
      net.pose(p.x,p.y,p.z,camera.rotation.y);\n      if(isHost&&now-lastWorld>=150){\n        lastWorld=now;\n        const enemies=getEnemies(),session=getSession();\n        if(enemies?.snapshot)net.world('zombies',enemies.snapshot().map(z=>({id:z.id,kind:z.kind,health:z.health,position:z.position})));\n        if(session)net.world('round',session.round);\n      }
    },
    shoot(data){net.event('shoot',data);},
    interact(data){net.event('interact',data);},
    destroy(){net.disconnect();for(const id of [...avatars.keys()])remove(id);geometry.dispose();material.dispose();}
  };
}
