import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const MAX_PLAYERS = 4;
const send = (ws, data) => { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const broadcast = (room, data, except) => { for (const player of room.players.values()) if(player.ws !== except) send(player.ws, data); };
const roomState = room => ({type:'room', code:room.code, host:room.host, players:[...room.players.values()].map(p=>({id:p.id,name:p.name,pose:p.pose,health:p.health})), round:room.round, started:room.started});
const newCode = () => { let code; do { code=randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(code)); return code; };
const cleanName = name => String(name||'Joueur').slice(0,24).replace(/[<>]/g,'');
const validPose = p => p && ['x','y','z','yaw'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 100000);
const server = http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'kino-multiplayer',status:'ok',rooms:rooms.size}));});
const wss = new WebSocketServer({server,maxPayload:8192});
wss.on('connection', ws => {
 const id=randomBytes(8).toString('hex'); let current=null; let lastPose=0;
 const leave=()=>{if(!current)return;const room=current;current=null;room.players.delete(id);if(!room.players.size){rooms.delete(room.code);return;}if(room.host===id)room.host=room.players.keys().next().value; broadcast(room,{type:'left',id});broadcast(room,roomState(room));};
 ws.on('message', raw=>{
  let msg;try{msg=JSON.parse(String(raw));}catch{return send(ws,{type:'error',message:'Invalid JSON'});}if(!msg || typeof msg!=='object' || Array.isArray(msg) || typeof msg.type!=='string')return;
  if(msg.type==='create'||msg.type==='join'){
    leave();let room;if(msg.type==='create'){const code=newCode();room={code,host:id,players:new Map(),round:1,started:false};rooms.set(code,room);}else{room=rooms.get(String(msg.code||'').trim().toUpperCase());if(!room)return send(ws,{type:'error',message:'Salon introuvable'});if(room.players.size>=MAX_PLAYERS)return send(ws,{type:'error',message:'Salon complet'});if(room.started)return send(ws,{type:'error',message:'Partie en cours'});}
    room.players.set(id,{id,name:cleanName(msg.name),ws,pose:null,health:100});current=room;send(ws,{type:'joined',id,code:room.code});broadcast(room,roomState(room));return;
  }
  if(!current)return send(ws,{type:'error',message:'Rejoins un salon'});
  if(msg.type==='leave'){leave();return;}
  if(msg.type==='start'&&current.host===id&&!current.started){current.started=true;broadcast(current,{type:'started'});broadcast(current,roomState(current));return;}
  if(msg.type==='pose'&&validPose(msg.pose)&&Date.now()-lastPose>=40){lastPose=Date.now();current.players.get(id).pose=msg.pose;broadcast(current,{type:'pose',id,pose:msg.pose},ws);return;}
  if(msg.type==='event'&&current.started&&['shoot','reload','knife','interact','down','revive'].includes(msg.event)&&JSON.stringify(msg.data??null).length<=2048){broadcast(current,{type:'event',id,event:msg.event,data:msg.data??null},ws);return;}
  if(msg.type==='world'&&current.started&&current.host===id){const allowed=['round','zombies','doors','points','drops'];if(!allowed.includes(msg.key)||JSON.stringify(msg.data??null).length>4096)return;broadcast(current,{type:'world',key:msg.key,data:msg.data},ws);return;}
 });
 ws.on('close',leave);ws.on('error',()=>{});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Kino multiplayer signaling on port '+PORT));
