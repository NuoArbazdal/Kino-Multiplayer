import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const TRANSFER_GRACE_MS = process.env.NODE_ENV === 'test' ? 150 : 30000;
const MAX_PLAYERS = 4;
const send = (ws, data) => { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const broadcast = (room, data, except) => { for (const player of room.players.values()) if(player.ws && player.ws !== except) send(player.ws, data); };
const roomState = room => ({type:'room', code:room.code, host:room.host, players:[...room.players.values()].map(p=>({id:p.id,name:p.name,pose:p.pose,health:p.health})), round:room.round, started:room.started});
const newCode = () => { let code; do { code=randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(code)); return code; };
const cleanName = name => String(name||'Joueur').slice(0,24).replace(/[<>]/g,'');
const validPose = p => p && ['x','y','z','yaw'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 100000);
const publicFiles = new Map([
 ['/', ['../client/index.html','text/html; charset=utf-8']],
 ['/index.html', ['../client/index.html','text/html; charset=utf-8']],
 ['/multiplayer.js', ['../client/multiplayer.js','text/javascript; charset=utf-8']]
]);
const server = http.createServer(async(req,res)=>{
 const pathname=new URL(req.url??'/', 'http://localhost').pathname;
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 if(pathname==='/health'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:JSON.stringify({service:'kino-multiplayer',status:'ok',rooms:rooms.size}));
   return;
 }
 const entry=publicFiles.get(pathname);
 if(!entry){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
 try{
   const body=await readFile(fileURLToPath(new URL(entry[0],import.meta.url)));
   res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:body);
 }catch(error){
   console.error('Static file unavailable',error.message);
   res.writeHead(500);res.end('Site unavailable');
 }
});
const wss = new WebSocketServer({server,maxPayload:8192});
wss.on('connection', ws => {
 let id=randomBytes(8).toString('hex'); let current=null; let lastPose=0;
 const evict=(room,playerId)=>{
  const player=room.players.get(playerId);
  if(!player)return;
  clearTimeout(player.expiry);
  room.players.delete(playerId);
  if(!room.players.size){rooms.delete(room.code);return;}
  if(room.host===playerId)room.host=room.players.keys().next().value;
  broadcast(room,{type:'left',id:playerId});
  broadcast(room,roomState(room));
 };
 const leave=(transfer=false)=>{
  if(!current)return;
  const room=current;current=null;
  const player=room.players.get(id);
  if(!player||player.ws!==ws)return;
  if(transfer){
    player.ws=null;
    player.expiry=setTimeout(()=>evict(room,id),TRANSFER_GRACE_MS);
    player.expiry.unref?.();
  }else evict(room,id);
 };
 ws.on('message', raw=>{
  let msg;try{msg=JSON.parse(String(raw));}catch{return send(ws,{type:'error',message:'Invalid JSON'});}if(!msg || typeof msg!=='object' || Array.isArray(msg) || typeof msg.type!=='string')return;
  if(msg.type==='create'||msg.type==='join'){
    leave();let room;if(msg.type==='create'){const code=newCode();room={code,host:id,players:new Map(),round:1,started:false};rooms.set(code,room);}else{room=rooms.get(String(msg.code||'').trim().toUpperCase());if(!room)return send(ws,{type:'error',message:'Salon introuvable'});if(room.players.size>=MAX_PLAYERS&&!msg.resume)return send(ws,{type:'error',message:'Salon complet'});if(room.started&&!msg.resume)return send(ws,{type:'error',message:'Partie en cours'});}
    const token=typeof msg.resume==='string'?msg.resume:'';
    const resumed=[...room.players.values()].find(p=>p.token===token&&token&&p.ws===null);
    if(room.started&&!resumed)return send(ws,{type:'error',message:'Reconnexion non autorisée'});
    if(resumed){
      clearTimeout(resumed.expiry);id=resumed.id;resumed.ws=ws;resumed.expiry=null;
    }else{
      if(room.players.size>=MAX_PLAYERS)return send(ws,{type:'error',message:'Salon complet'});
      room.players.set(id,{id,name:cleanName(msg.name),ws,pose:null,health:100,token:randomBytes(24).toString('hex'),expiry:null});
    }
    current=room;
    send(ws,{type:'joined',id,code:room.code,resume:room.players.get(id).token,started:room.started});
    broadcast(room,roomState(room));return;
  }
  if(!current)return send(ws,{type:'error',message:'Rejoins un salon'});
  if(msg.type==='leave'){leave();return;}
  if(msg.type==='start'&&current.host===id&&!current.started){current.started=true;broadcast(current,{type:'started'});broadcast(current,roomState(current));return;}
  if(msg.type==='pose'&&validPose(msg.pose)&&Date.now()-lastPose>=40){lastPose=Date.now();current.players.get(id).pose=msg.pose;broadcast(current,{type:'pose',id,pose:msg.pose},ws);return;}
  if(msg.type==='event'&&current.started&&['shoot','reload','knife','interact','down','revive'].includes(msg.event)&&JSON.stringify(msg.data??null).length<=2048){broadcast(current,{type:'event',id,event:msg.event,data:msg.data??null},ws);return;}
  if(msg.type==='world'&&current.started&&current.host===id){const allowed=['round','zombies','doors','points','drops'];if(!allowed.includes(msg.key)||JSON.stringify(msg.data??null).length>4096)return;broadcast(current,{type:'world',key:msg.key,data:msg.data},ws);return;}
 });
 ws.on('close',()=>leave(true));ws.on('error',()=>{});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Kino multiplayer signaling on port '+PORT));
