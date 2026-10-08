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
  let lastSent=0, connected=false;
  function remove(id){const mesh=avatars.get(id);if(mesh){scene.remove(mesh);avatars.delete(id);}}
  function ensure(id){let mesh=avatars.get(id);if(!mesh){mesh=new THREE.Mesh(geometry,material);mesh.userData.remotePlayerId=id;scene.add(mesh);avatars.set(id,mesh);}return mesh;}
  net.addEventListener('joined',()=>{connected=true;});
  net.addEventListener('room',e=>{const active=new Set(e.detail.players.map(p=>p.id));for(const id of avatars.keys())if(!active.has(id))remove(id);for(const p of e.detail.players)if(p.id!==net.id&&p.pose){const m=ensure(p.id);m.position.set(p.pose.x,p.pose.y+45,p.pose.z);m.rotation.y=p.pose.yaw;}});
  net.addEventListener('pose',e=>{if(e.detail.id===net.id)return;const p=e.detail.pose;const m=ensure(e.detail.id);m.userData.target=new THREE.Vector3(p.x,p.y+45,p.z);m.rotation.y=p.yaw;});
  net.addEventListener('left',e=>remove(e.detail.id));
  net.addEventListener('world',e=>{
    const {key,data}=e.detail;
    if(key==='round'&&Number.isInteger(data)&&data>0){const s=getSession();if(s&&s.round!==data)s.round=data;}
    // Other world state requires native game-engine adapters, not blind assignment.
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
      net.pose(p.x,p.y,p.z,camera.rotation.y);
    },
    shoot(data){net.event('shoot',data);},
    interact(data){net.event('interact',data);},
    destroy(){net.disconnect();for(const id of [...avatars.keys()])remove(id);geometry.dispose();material.dispose();}
  };
}
