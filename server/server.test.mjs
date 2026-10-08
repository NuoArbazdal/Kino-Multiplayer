import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const port=32000+Math.floor(Math.random()*2000);
const endpoint='ws://127.0.0.1:'+port;
const child=spawn(process.execPath,['index.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'test'},stdio:'pipe'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){
 for(let i=0;i<50;i++){
  try{return await new Promise((resolve,reject)=>{const ws=new WebSocket(endpoint);ws.once('open',()=>resolve(ws));ws.once('error',reject);});}
  catch{await sleep(50);}
 }
 throw Error('Server did not start');
}
function wait(ws,type,timeout=2000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handler);reject(Error('Timeout: '+type));},timeout);const handler=raw=>{let data;try{data=JSON.parse(raw);}catch{return;}if(data.type===type){clearTimeout(timer);ws.off('message',handler);resolve(data);}};ws.on('message',handler);});}
function send(ws,data){ws.send(JSON.stringify(data));}
test('private rooms, four-player cap, relay and host transfer',async t=>{
 const sockets=[];t.after(()=>{sockets.forEach(ws=>ws.terminate());child.kill();});
 const host=await connect();sockets.push(host);const joined=wait(host,'joined');send(host,{type:'create',name:'Host'});const {code,id}=await joined;assert.match(code,/^[A-F0-9]{8}$/);
 const guests=[],guestInfo=[];for(let i=0;i<3;i++){const ws=await connect();sockets.push(ws);const got=wait(ws,'joined');send(ws,{type:'join',code,name:'Guest'+i});guestInfo.push(await got);guests.push(ws);}
 const extra=await connect();sockets.push(extra);const err=wait(extra,'error');send(extra,{type:'join',code});assert.equal((await err).message,'Salon complet');
 const relayed=wait(guests[0],'pose');send(host,{type:'pose',pose:{x:1,y:2,z:3,yaw:0}});assert.equal((await relayed).id,id);
 const started=wait(guests[0],'started');send(host,{type:'start'});await started;
 const previous=guestInfo[2];guests[2].close();await new Promise(resolve=>guests[2].once('close',resolve));
 const resumed=await connect();sockets.push(resumed);
 const rejoined=wait(resumed,'joined');send(resumed,{type:'join',code,name:'Guest2',resume:previous.resume});
 const after=await rejoined;assert.equal(after.id,previous.id);assert.equal(after.started,true);
 const forbidden=await connect();sockets.push(forbidden);const denied=wait(forbidden,'error');send(forbidden,{type:'join',code,name:'Intruder',resume:'wrong'});assert.equal((await denied).message,'Reconnexion non autorisée');
 const left=wait(guests[0],'left');host.close();await left;
 const state=wait(guests[1],'room');send(guests[0],{type:'leave'});const update=await state;assert.ok(update.players.length<=2);
});
