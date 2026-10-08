// Browser networking module. Import this module into the Kino runtime to attach game events.
export class KinoMultiplayer extends EventTarget {
  constructor(endpoint) { super(); this.endpoint=endpoint;this.socket=null;this.id=null;this.code=null;this.resume=null; }
  connect() { return new Promise((resolve,reject)=> { const ws=new WebSocket(this.endpoint);this.socket=ws;ws.onopen=resolve;ws.onerror=reject;ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='joined'){this.id=m.id;this.code=m.code;this.resume=m.resume??null;}this.dispatchEvent(new CustomEvent(m.type,{detail:m}));};ws.onclose=()=>this.dispatchEvent(new Event('disconnected')); }); }
  send(data) {if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(data));}
  create(name) {this.send({type:'create',name});}
  join(code,name,resume=null) {this.send({type:'join',code,name,resume});}
  start() {this.send({type:'start'});}
  pose(x,y,z,yaw) {this.send({type:'pose',pose:{x,y,z,yaw}});}
  event(event,data) {this.send({type:'event',event,data});}
  world(key,data) {this.send({type:'world',key,data});}
  disconnect() {this.socket?.close();}
}
