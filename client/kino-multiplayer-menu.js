// Adds co-op matchmaking within the original Kino menu, without replacing its solo controls.
import { KinoMultiplayer } from './multiplayer.js';

export function installKinoMultiplayerMenu(coop) {
  const start=document.getElementById('start'),menu=start?.parentElement;
  if(!start||!menu)return;
  const params=new URLSearchParams(location.search);
  const button=document.createElement('button');
  button.type='button';button.className='secondary';button.textContent='MULTIPLAYER / CO-OP';
  start.insertAdjacentElement('afterend',button);
  const panel=document.createElement('div');
  panel.hidden=true;panel.style.cssText='margin:12px 0;max-width:410px;padding:16px;background:rgba(0,0,0,.8);border:1px solid #8b3333;color:white;font:14px system-ui;position:relative;z-index:3';
  panel.innerHTML=`<p style="margin:0 0 10px">KINO DER TOTEN / CO-OP (2–4 JOUEURS)</p>
    <label>Serveur multijoueur<input data-kino="endpoint" placeholder="wss://serveur.example.com" style="display:block;width:100%;box-sizing:border-box;background:#171717;color:white;padding:8px"></label>
    <label>Pseudo<input data-kino="name" maxlength="24" value="Joueur" style="display:block;width:100%;box-sizing:border-box;background:#171717;color:white;padding:8px"></label>
    <p><button type="button" data-kino="create">CRÉER UN SALON</button></p>
    <label>Code du salon<input data-kino="code" maxlength="8" placeholder="XXXXXXXX" style="background:#171717;color:white;padding:8px"></label>
    <button type="button" data-kino="join">REJOINDRE</button>
    <div data-kino="room" hidden>
      <p>CODE : <strong data-kino="room-code"></strong></p>
      <div data-kino="players"></div>
      <button type="button" data-kino="start" disabled>DÉMARRER EN COOP</button>
    </div>
    <p data-kino="status" role="status" style="color:#e1b2b2"></p>`;
  button.insertAdjacentElement('afterend',panel);
  const el=key=>panel.querySelector('[data-kino="'+key+'"]');
  const status=text=>{el('status').textContent=text;};
  const defaultEndpoint=params.get('server')||((location.protocol==='https:'?'wss://':'ws://')+location.host);
  el('endpoint').value=defaultEndpoint;
  el('name').value=params.get('name')||'Joueur';
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
  function showRoom(room,id){
    el('room').hidden=false;
    el('room-code').textContent=room.code;
    el('players').textContent=room.players.map(p=>(p.id===room.host?'[HÔTE] ':'')+p.name).join(' / ');
    el('start').disabled=room.started||room.host!==id;
    status(room.started?'Salon lancé. La synchronisation du gameplay est encore expérimentale.':'En attente des joueurs.');
  }
  if(coop){
    panel.hidden=false;
    el('create').disabled=true;el('join').disabled=true;
    el('endpoint').value=coop.net.endpoint;el('code').value=params.get('room')||'';
    coop.net.addEventListener('room',e=>showRoom(e.detail,coop.net.id));
    coop.net.addEventListener('started',()=>status('Partie démarrée : sélectionne ENTER THE THEATER.'));
    coop.net.addEventListener('error',e=>status(e.detail.message||'Erreur réseau'));
    el('start').addEventListener('click',()=>coop.net.start());
  }else{
    let connecting=false;
    async function enter(mode){
      if(connecting)return;
      const endpoint=el('endpoint').value.trim();
      const name=el('name').value.trim()||'Joueur',code=el('code').value.trim().toUpperCase();
      if(!/^wss?:\/\//.test(endpoint)){status('Adresse du serveur invalide');return;}
      if(mode==='join'&&!/^[A-F0-9]{8}$/.test(code)){status('Code invalide (8 caractères)');return;}
      connecting=true;status('Connexion au serveur…');
      const net=new KinoMultiplayer(endpoint);
      net.addEventListener('error',e=>{connecting=false;status(e.detail.message||'Erreur réseau');net.disconnect();});
      net.addEventListener('joined',e=>{
        const url=new URL(location.href);
        url.searchParams.set('server',endpoint);
        url.searchParams.set('room',e.detail.code);
        url.searchParams.set('resume',e.detail.resume);
        url.searchParams.set('name',name);
        location.assign(url.href);
      });
      try{
        await net.connect();
        if(mode==='create')net.create(name);else net.join(code,name);
      }catch(e){connecting=false;status(e.message||'Connexion impossible');}
    }
    el('create').addEventListener('click',()=>enter('create'));
    el('join').addEventListener('click',()=>enter('join'));
  }
}
