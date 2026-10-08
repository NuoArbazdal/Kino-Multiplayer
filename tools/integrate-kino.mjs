#!/usr/bin/env node
// Apply the isolated networking bridge to a checked-out copy of the original Kino source.
// Usage: node tools/integrate-kino.mjs /path/to/kino-der-toten
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=process.argv[2];
if(!root){console.error('Usage: node tools/integrate-kino.mjs <original-game-checkout>');process.exit(1);}
const game=path.join(root,'export','web','game.js');
const html=path.join(root,'export','web','index.html');
if(!fs.existsSync(game)||!fs.existsSync(html))throw Error('Original Kino game.js and index.html not found');
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(game,'utf8');
if(!source.includes("import * as THREE from 'three';")||!source.includes('function renderFrame(now)')||!source.includes('const scene=new THREE.Scene()'))throw Error('Unsupported original game revision: no changes made');
const bridgeImport="import { attachKinoCoop } from './kino-runtime-bridge.js';";
const menuImport="import { installKinoMultiplayerMenu } from './kino-multiplayer-menu.js';";
if(source.includes(bridgeImport)){
 const markers=[menuImport,'installKinoMultiplayerMenu(coop);','const coopParams=new URLSearchParams','coop.shoot({targetId:target.z.id','if(!coop||coop.isHost)enemies.update(dt,player.getFeetPosition());','coop?.update(now);'];
 if(!markers.every(marker=>source.includes(marker)))throw Error('Partial integration detected; inspect original and backup before retrying');
 console.log('Already integrated; no files changed');process.exit(0);
}
const bridgeInit=`const coopParams=new URLSearchParams(location.search);
const coop=attachKinoCoop({
  scene,camera,
  getPlayerPosition:()=>player?.getFeetPosition?.(),
  getSession:()=>session,
  getEnemies:()=>enemies,
  getWorld:()=>world,
  serverUrl:coopParams.get('server'),
  code:coopParams.get('room'),
  resume:coopParams.get('resume'),
  name:coopParams.get('name')||'Joueur'
});`;
let next=source;
if(!next.includes(bridgeImport))next=bridgeImport+'\n'+next;
if(!next.includes(menuImport))next=menuImport+'\n'+next;
if(!next.includes('const coopParams=new URLSearchParams'))next=next.replace('const scene=new THREE.Scene();', 'const scene=new THREE.Scene();\n'+bridgeInit+'\ninstallKinoMultiplayerMenu(coop);');
if(!next.includes("coop.shoot({targetId:target.z.id")) {
 const needle="if(target){const d=target.distance>session.def.range?session.def.minDamage:session.def.damage;enemies.hurt(target.z,d*(target.head?Math.max(1,session.def.headMultiplier):1),target.head,false,session.def.explosionRadius?'explosion':'bullet');}";
 const replacement="if(target){const d=target.distance>session.def.range?session.def.minDamage:session.def.damage;const hitDamage=d*(target.head?Math.max(1,session.def.headMultiplier):1);if(coop&&!coop.isHost)coop.shoot({targetId:target.z.id,damage:hitDamage,head:target.head});else enemies.hurt(target.z,hitDamage,target.head,false,session.def.explosionRadius?'explosion':'bullet');}";
 if(!next.includes(needle))throw Error('Shot hook not found; refusing to patch');
 next=next.replace(needle,replacement);
}
if(!next.includes('if(!coop||coop.isHost)enemies.update(dt,player.getFeetPosition());')){
 const needle='enemies.update(dt,player.getFeetPosition());';
 if(!next.includes(needle))throw Error('Enemy update hook unavailable');
 next=next.replace(needle,'if(!coop||coop.isHost)enemies.update(dt,player.getFeetPosition());');
}
if(!next.includes('coop?.update(now);'))next=next.replace('  update(dt);renderer.info.reset();','  update(dt);coop?.update(now);renderer.info.reset();');
if(next===source){console.log('Already integrated');process.exit(0);}
for(const file of ['multiplayer.js','kino-runtime-bridge.js','kino-multiplayer-menu.js']){
 const src=path.join(base,'client',file),dst=path.join(root,'export','web',file);
 if(!fs.existsSync(src))throw Error('Missing '+src);
 if(fs.existsSync(dst)&&fs.readFileSync(src,'utf8')!==fs.readFileSync(dst,'utf8'))throw Error('Refusing to overwrite modified '+dst);
}
if(fs.existsSync(game+'.kino-multiplayer.bak'))throw Error('Existing backup detected; refusing to overwrite');
fs.writeFileSync(game+'.kino-multiplayer.bak',source,{flag:'wx'});
fs.writeFileSync(game,next);
for(const file of ['multiplayer.js','kino-runtime-bridge.js'])fs.copyFileSync(path.join(base,'client',file),path.join(root,'export','web',file));
console.log('Bridge integrated; original game backup: '+game+'.kino-multiplayer.bak');
console.log('Open game with ?server=wss://HOST&room=CODE&name=NAME after deploying the server.');
console.log('WARNING: this is remote-player position visualization, not synchronized cooperative gameplay.');
