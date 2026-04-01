'use strict';
// ── State ──────────────────────────────────────────────────────────────────
let wsClient=null,myName='',currentChat=null,replyTo=null,activeTab='All';
let callId=null,typTimer=null,stkCat=null,onlineUsers=[],userInfo={};
const chats={};
const $=id=>document.getElementById(id);

// ── LOGIN ──────────────────────────────────────────────────────────────────
function doLogin(action){
  const name=$('loginName').value.trim(), pass=$('loginPass').value;
  const host=$('loginHost').value.trim()||CONFIG.DEFAULT_HOST;
  const room=$('loginRoom').value.trim()||CONFIG.DEFAULT_ROOM;
  const about=$('loginAbout').value.trim();
  if(!name||!pass){$('loginErr').textContent='⚠ Name and password required';return;}
  $('loginErr').innerHTML='⏳ Connecting...'; $('loginErr').style.color='var(--yellow)';
  myName=name;
  try{ wsClient=new WSClient(handlePacket); wsClient.connect(host,name,pass,action,about,room); }
  catch(e){$('loginErr').textContent='❌ '+e.message; $('loginErr').style.color='var(--red)';}
}

// ── PACKET HANDLER ─────────────────────────────────────────────────────────
function handlePacket(p){
  switch(p.type){
    case 'auth_ok':
      closeModal('loginModal');
      $('myAvatar').textContent=getInitial(myName);
      $('myUsername').textContent=myName;
      hideConnBar();
      wsClient.joinRoom(wsClient._pendingRoom||CONFIG.DEFAULT_ROOM);
      break;

    case 'auth_fail':
      $('loginErr').innerHTML='❌ '+p.reason;
      $('loginErr').style.color='var(--red)';
      break;

    case 'join_ok':
      ensureChat(p.room,false);
      selectChat(p.room);
      break;

    case 'user_list':
      onlineUsers=p.users||[];
      (p.user_info||[]).forEach(u=>userInfo[u.username]=u);
      onlineUsers.forEach(u=>{if(u!==myName)ensureChat(u,false);});
      renderChatList();
      renderGroupMembers();
      break;

    case 'message_history':
      (p.messages||[]).forEach(m=>{
        // FIX: correctly set isMe based on who sent it
        pushMsg(p.room||currentChat,{...m, isMe: m.from===myName},false);
      });
      if(currentChat===p.room){renderMessages();scrollBottom($('messagesArea'));}
      break;

    case 'message':{
      const isMe = p.from===myName;
      const key = p.private
        ? (isMe ? (p.to||currentChat) : p.from)
        : currentChat;
      ensureChat(key,false);
      // FIX 1: Server echoes sender's own message back — push it now (not in sendMessage)
      pushMsg(key,{...p, isMe});
      if(!isMe){
        if(key!==currentChat){chats[key].unread++;renderChatList();}
        wsClient.sendReadReceipt(p.msg_id,p.from);
      }
      break;
    }

    case 'file':{
      // FIX 3: skip echo to sender (sender already showed it locally)
      if(p.from===myName) break;
      const fk = p.private ? p.from : currentChat;
      ensureChat(fk,false);
      // FIX 3: create blob URL so receiver can open the file
      const blob = b64ToBlob(p.data, p.filename);
      const url  = URL.createObjectURL(blob);
      const actualSize = blob.size > 0 ? blob.size : p.size;
      pushMsg(fk,{...p, isMe:false, fileURL:url, size:actualSize});
      if(fk!==currentChat){chats[fk].unread++;renderChatList();}
      break;
    }

    case 'reaction':
      // FIX: reaction goes to correct chat, not always currentChat
      {
        const reactChat = p.private ? p.from : currentChat;
        pushMsg(reactChat,{type:'reaction_display',from:p.from,emoji:p.emoji,isMe:false});
      }
      break;

    case 'typing':
      $('typingBar').textContent=p.from+' is typing...';
      clearTimeout(typTimer);
      typTimer=setTimeout(()=>$('typingBar').textContent='',2500);
      break;

    case 'stop_typing':
      $('typingBar').textContent='';
      break;

    case 'system':
      // FIX: system messages only go to the room, NOT into DM chats
      pushMsg(currentChat,{type:'system',text:p.text});
      break;

    case 'user_joined':
      // FIX 2: only show in ROOM chat, not in DM chats
      ensureChat(p.username,false);
      {
        const roomKey = wsClient?._pendingRoom || 'General';
        if(chats[roomKey]){
          pushMsg(roomKey,{type:'system',text:'● '+p.username+' came online'}, currentChat===roomKey);
        }
        renderChatList();
      }
      break;

    case 'user_left':
      // FIX 2: only show in the ROOM chat, never pollute DM chats
      {
        const roomKey = wsClient?._pendingRoom || 'General';
        if(chats[roomKey]){
          pushMsg(roomKey,{type:'system',text:'○ '+p.username+' went offline'}, currentChat===roomKey);
        }
        renderChatList();
      }
      break;

    case 'user_status':
      if(userInfo[p.username]) userInfo[p.username].status=p.status;
      if($('peerName').textContent===p.username) updatePeerStatus(p.status);
      break;

    case 'added_to_group':
      ensureChat(p.group,true);
      pushMsg(p.group,{type:'system',text:`👥 You were added to group "${p.group}" by ${p.by}`},p.group===currentChat);
      renderChatList();
      break;

    case 'message_deleted':
      pushMsg(currentChat,{type:'system',text:`🗑 Message deleted by ${p.by}`});
      break;

    case 'incoming_call':
      callId=p.call_id;
      if(confirm(`${p.call_type==='video'?'📹':'📞'} Incoming ${p.call_type} call from ${p.from}\n\nAccept?`)){
        wsClient.callAccept(callId);
        showCallBar(`🔴 On ${p.call_type} call with ${p.from}`);
      } else {
        wsClient.callReject(callId); callId=null;
      }
      break;

    case 'call_ringing':
      callId=p.call_id;
      showCallBar(`📞 Calling ${p.to}...`);
      break;

    case 'call_accepted':
      showCallBar(`🔴 On ${p.call_type||'voice'} call with ${p.from}`);
      break;

    case 'call_rejected':
      showCallBar(''); callId=null;
      pushMsg(currentChat,{type:'system',text:`❌ Call rejected: ${p.reason||'Declined'}`});
      break;

    case 'call_ended':
      showCallBar(''); callId=null;
      pushMsg(currentChat,{type:'system',text:`📵 Call ended by ${p.from}`});
      break;

    case 'disconnected':
      showConnBar('⚠ Disconnected — refresh page');
      break;
  }
}

// ── CHAT LIST ──────────────────────────────────────────────────────────────
function ensureChat(key,isGroup){
  if(!chats[key]) chats[key]={name:key,isGroup,msgs:[],unread:0};
}

function renderChatList(){
  const list=$('chatList'), q=$('searchChats').value.toLowerCase();
  list.innerHTML='';
  for(const[key,chat]of Object.entries(chats)){
    if(q&&!key.toLowerCase().includes(q)) continue;
    if(activeTab==='Groups'&&!chat.isGroup) continue;
    if(activeTab==='DMs'&&chat.isGroup) continue;
    const last=chat.msgs.filter(m=>m.type==='message'||m.type==='file').slice(-1)[0];
    const sub=last?(last.isMe?`You: ${last.text||'📎 '+last.filename}`:last.text||'📎 '+last.filename):'Click to chat';
    const bg=chat.isGroup?'#bf59cf':'#00a884';
    const init=chat.isGroup?'👥':getInitial(key);
    const fs=chat.isGroup?'18px':'15px';
    const item=document.createElement('div');
    item.className='chat-item'+(currentChat===key?' active':'');
    item.onclick=()=>selectChat(key);
    item.innerHTML=`
      <div class="avatar" style="background:${bg};font-size:${fs}">${init}</div>
      <div class="info">
        <div class="name-row">
          <span class="chat-name">${esc(key)}</span>
          <span class="chat-time">${esc(last?.time||'')}</span>
        </div>
        <div class="sub-row">
          <span class="chat-sub">${esc(sub.slice(0,42))}</span>
          ${chat.unread?`<span class="badge">${chat.unread}</span>`:''}
        </div>
      </div>`;
    list.appendChild(item);
  }
}

function selectChat(key){
  ensureChat(key,chats[key]?.isGroup||false);
  currentChat=key;
  chats[key].unread=0;
  $('placeholder').style.display='none';
  $('chatView').style.display='flex';
  const chat=chats[key];
  const bg=chat.isGroup?'#bf59cf':'#00a884';
  const init=chat.isGroup?'👥':getInitial(key);
  const fs=chat.isGroup?'18px':'15px';
  $('peerAvatar').textContent=init;
  $('peerAvatar').style.background=bg;
  $('peerAvatar').style.fontSize=fs;
  $('peerName').textContent=key;
  updatePeerStatus(userInfo[key]?.status||(chat.isGroup?'group':'online'));
  renderMessages();
  renderChatList();
  $('msgInput').focus();
  wsClient?.getUsers();
}

function updatePeerStatus(s){
  const el=$('peerStatus');
  const map={online:'● online',away:'◑ away',busy:'○ busy',offline:'○ offline',group:'👥 Group'};
  el.textContent=map[s]||'● online';
  el.className='peer-status'+(s==='away'?' away':s==='busy'?' busy':'');
}

// ── MESSAGES ──────────────────────────────────────────────────────────────
function pushMsg(chatKey,msg,renderNow=true){
  if(!chatKey) return;
  ensureChat(chatKey,chats[chatKey]?.isGroup||false);
  chats[chatKey].msgs.push(msg);
  if(renderNow&&chatKey===currentChat){
    const ma=$('messagesArea');
    const el=buildBubble(msg,myName,chats[chatKey]?.isGroup);
    if(el){ma.appendChild(el);scrollBottom(ma);}
  }
  renderChatList();
}

function renderMessages(){
  const ma=$('messagesArea');
  ma.innerHTML='';
  if(!currentChat) return;
  (chats[currentChat].msgs||[]).forEach(m=>{
    const el=buildBubble(m,myName,chats[currentChat]?.isGroup);
    if(el) ma.appendChild(el);
  });
  scrollBottom(ma);
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────────
function sendMessage(){
  const inp=$('msgInput'), text=inp.value.trim();
  if(!text||!currentChat||!wsClient) return;
  inp.value='';
  const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient._pendingRoom;
  const savedReply=replyTo;
  if(replyTo) clearReply();
  // FIX 1: Do NOT push locally — server will echo it back with msg_id
  // We only track a "pending" id to avoid duplicate on echo
  const pendingId = Date.now();
  window._pendingMsgId = pendingId;
  wsClient.sendMsg(text, isPrivate?currentChat:null, savedReply);
  wsClient.sendStopTyping();
}

function onMsgKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}
function onMsgInput(){
  wsClient?.sendTyping();
  clearTimeout(typTimer);
  typTimer=setTimeout(()=>wsClient?.sendStopTyping(),2000);
}

// ── REACTIONS ─────────────────────────────────────────────────────────────
function sendReaction(emoji){
  if(!currentChat||!wsClient) return;
  // flash button
  document.querySelectorAll('.rx-btn').forEach(b=>{
    if(b.textContent.trim()===emoji){
      b.classList.add('flash');
      setTimeout(()=>b.classList.remove('flash'),400);
    }
  });
  // FIX: show reaction immediately on sender side
  pushMsg(currentChat,{type:'reaction_display',from:myName,emoji,isMe:true,time:nowTs()});
  wsClient.sendReaction(emoji);
}

// ── REPLY ─────────────────────────────────────────────────────────────────
function setReply(text){
  replyTo=text;
  $('replyText').textContent='Replying to: '+text.slice(0,50);
  $('replyBar').classList.add('show');
  $('msgInput').focus();
}
function clearReply(){replyTo=null; $('replyBar').classList.remove('show');}

// ── ATTACH ────────────────────────────────────────────────────────────────
function toggleAttach(){$('attachMenu').classList.toggle('show'); $('emojiPicker').classList.remove('show');}
function closeAttach(){$('attachMenu').classList.remove('show');}

function pickFile(accept){
  closeAttach();
  const fi=$('fileInput'); fi.accept=accept; fi.click();
}

function onFilePicked(input){
  const file=input.files[0];
  if(!file||!currentChat||!wsClient) return;
  if(file.size>CONFIG.MAX_FILE_MB*1024*1024){alert(`Max ${CONFIG.MAX_FILE_MB} MB`);return;}
  const url=URL.createObjectURL(file);
  const ftype=getFileType(file.name);
  const now=nowTs();
  // Show on sender side immediately with actual file size
  // FIX 3: Push file with blob URL on sender side (so sender can open it too)
  pushMsg(currentChat,{
    type:'file',from:myName,filename:file.name,
    size:file.size,
    file_type:ftype,fileURL:url,time:now,isMe:true
  });
  const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient._pendingRoom;
  const reader=new FileReader();
  reader.onload=e=>{
    const b64=e.target.result.split(',')[1];
    wsClient.sendFile(file.name,file.size,ftype,b64,isPrivate?currentChat:null);
  };
  reader.readAsDataURL(file);
  input.value='';
}

function openCamera(){
  closeAttach();
  const win=window.open('','_blank','width=520,height=440');
  win.document.write(`<html><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center">
    <video id="v" autoplay style="width:100%;max-height:340px"></video>
    <div style="display:flex;gap:12px;margin:10px">
      <button onclick="snap()" style="padding:10px 24px;background:#00a884;color:#000;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700">📷 Capture</button>
      <button onclick="window.close()" style="padding:10px 16px;background:#2a3942;color:#e9edef;border:none;border-radius:8px;font-size:15px;cursor:pointer">Close</button>
    </div>
    <canvas id="c" style="display:none"></canvas>
    <script>
      navigator.mediaDevices.getUserMedia({video:true})
        .then(s=>{document.getElementById('v').srcObject=s;window._s=s;})
        .catch(()=>alert('No camera found'));
      function snap(){
        const v=document.getElementById('v'),c=document.getElementById('c');
        c.width=v.videoWidth; c.height=v.videoHeight;
        c.getContext('2d').drawImage(v,0,0);
        const dataUrl=c.toDataURL('image/jpeg');
        window.opener._camCapture(dataUrl);
        window._s?.getTracks().forEach(t=>t.stop());
        window.close();
      }
    <\/script></body></html>`);

  window._camCapture=dataUrl=>{
    // FIX: calculate actual blob size for camera photo
    fetch(dataUrl).then(r=>r.blob()).then(blob=>{
      const actualSize=blob.size;
      const url2=URL.createObjectURL(blob);
      pushMsg(currentChat,{
        type:'file',from:myName,filename:'photo.jpg',
        size:actualSize,  // FIX: real size not 0
        file_type:'image',fileURL:url2,time:nowTs(),isMe:true
      });
      const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient?._pendingRoom;
      const reader=new FileReader();
      reader.onload=e=>{
        const b64=e.target.result.split(',')[1];
        wsClient?.sendFile('photo.jpg',actualSize,'image',b64,isPrivate?currentChat:null);
      };
      reader.readAsDataURL(blob);
    });
  };
}

// ── LOCATION ─────────────────────────────────────────────────────────────
function sendLocation(){
  const loc=$('locName').value.trim();
  const lat=$('locLat').value.trim();
  const lon=$('locLon').value.trim();
  if(!loc||!currentChat) return;
  const mapsUrl=`https://maps.google.com/?q=${lat},${lon}`;
  const text=`📍 Location: ${loc} | Lat: ${lat}, Lon: ${lon} | Maps: ${mapsUrl}`;
  const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient._pendingRoom;
  pushMsg(currentChat,{type:'message',from:myName,text,time:nowTs(),isMe:true});
  wsClient?.sendMsg(text,isPrivate?currentChat:null);
  closeModal('locationModal');
}

// ── CONTACT ──────────────────────────────────────────────────────────────
function sendContact(){
  const n=$('conName').value.trim();
  if(!n){alert('Enter name');return;}
  const p=$('conPhone').value.trim();
  const e=$('conEmail').value.trim();
  const c=$('conCompany').value.trim();
  const text=`👤 Contact: ${n} | Phone: ${p||'N/A'} | Email: ${e||'N/A'} | Company: ${c||'N/A'}`;
  const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient._pendingRoom;
  pushMsg(currentChat,{type:'message',from:myName,text,time:nowTs(),isMe:true});
  wsClient?.sendMsg(text,isPrivate?currentChat:null);
  closeModal('contactModal');
}

// ── STICKERS ─────────────────────────────────────────────────────────────
function openStickerModal(){closeAttach();stkCat=Object.keys(STICKERS)[0];renderStickerModal();openModal('stickerModal');}
function renderStickerModal(){
  $('stickerTabs').innerHTML=Object.keys(STICKERS).map(c=>
    `<button class="sticker-tab${c===stkCat?' active':''}" onclick="switchStk('${esc(c)}',this)">${c.split(' ')[0]}</button>`
  ).join('');
  $('stickerGrid').innerHTML=(STICKERS[stkCat]||[]).map(s=>
    `<span class="sticker-item" onclick="sendSticker('${s}')">${s}</span>`
  ).join('');
}
function switchStk(cat,btn){
  stkCat=cat;
  document.querySelectorAll('.sticker-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $('stickerGrid').innerHTML=(STICKERS[cat]||[]).map(s=>
    `<span class="sticker-item" onclick="sendSticker('${s}')">${s}</span>`
  ).join('');
}
function sendSticker(emoji){
  if(!currentChat) return;
  const isPrivate=!chats[currentChat]?.isGroup && currentChat!==wsClient._pendingRoom;
  pushMsg(currentChat,{type:'message',from:myName,text:emoji,time:nowTs(),isMe:true});
  wsClient?.sendMsg(emoji,isPrivate?currentChat:null);
  closeModal('stickerModal');
}

// ── EMOJI ─────────────────────────────────────────────────────────────────
function toggleEmoji(){
  const ep=$('emojiPicker');
  if(!ep.classList.contains('show'))
    ep.innerHTML='<div class="emoji-grid">'+EMOJIS.map(e=>`<button class="emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`).join('')+'</div>';
  ep.classList.toggle('show');
  $('attachMenu').classList.remove('show');
}
function insertEmoji(e){const inp=$('msgInput');inp.value+=e;inp.focus();$('emojiPicker').classList.remove('show');}

// ── GROUP ─────────────────────────────────────────────────────────────────
function openGroupModal(){renderGroupMembers();openModal('groupModal');}
function renderGroupMembers(){
  const div=$('memberList');
  if(!div) return;
  const others=onlineUsers.filter(u=>u!==myName);
  div.innerHTML=others.length
    ? others.map(u=>`<label class="member-label"><input type="checkbox" value="${esc(u)}" style="accent-color:var(--green)"> ${esc(u)}</label>`).join('')
    : '<span style="font-size:12px;color:var(--ts)">No other users online</span>';
}
function createGroup(){
  const name=$('groupName').value.trim();
  const members=[...document.querySelectorAll('#memberList input:checked')].map(i=>i.value);
  if(!name){alert('Enter group name');return;}
  if(!members.length){alert('Select at least one member');return;}
  ensureChat(name,true);
  chats[name].msgs.push({type:'system',text:`Group "${name}" created`});
  wsClient?.createGroup(name,members);
  closeModal('groupModal');
  renderChatList();
  selectChat(name);
}

// ── CALLS ─────────────────────────────────────────────────────────────────
function startCall(type){
  const peer=$('peerName').textContent;
  if(!peer||chats[peer]?.isGroup){alert('Open a DM first to make a call');return;}
  wsClient?.callRequest(peer,type);
  pushMsg(currentChat,{type:'system',text:`${type==='video'?'📹':'📞'} Calling ${peer}...`});
  showCallBar(`📞 Calling ${peer}...`);
}
function endCall(){if(callId)wsClient?.callEnd(callId); callId=null; showCallBar('');}
function showCallBar(msg){
  const b=$('callBar');
  if(!msg){b.classList.remove('show');b.innerHTML='';return;}
  b.innerHTML=msg+` <button onclick="endCall()" style="background:var(--red);color:#fff;border:none;border-radius:6px;padding:3px 12px;cursor:pointer;font-size:12px;margin-left:8px;font-weight:600">📵 End</button>`;
  b.classList.add('show');
}

// ── CONTEXT MENU ──────────────────────────────────────────────────────────
function ctxAction(action){
  $('ctxMenu').classList.remove('show');
  const msg=window._ctxMsg;
  if(!msg) return;
  if(action==='reply') setReply(msg.text||msg.filename||'');
  if(action==='copy')  navigator.clipboard?.writeText(msg.text||msg.filename||'');
  if(action==='forward'){
    const dest=prompt('Forward to (chat name):');
    if(dest&&chats[dest]){
      const ip=!chats[dest]?.isGroup;
      pushMsg(dest,{type:'message',from:myName,text:msg.text||'',time:nowTs(),isMe:true});
      wsClient?.sendMsg(msg.text||'',ip?dest:null);
    }
  }
  if(action==='delete'){
    wsClient?.deleteMessage(msg.id||msg.msg_id||'');
    pushMsg(currentChat,{type:'system',text:'🗑 You deleted a message'});
  }
}

// ── SEARCH ────────────────────────────────────────────────────────────────
function openSearch(){
  const q=prompt('Search messages:');
  if(!q||!currentChat) return;
  const results=(chats[currentChat]?.msgs||[]).filter(m=>(m.text||'').toLowerCase().includes(q.toLowerCase()));
  if(!results.length){alert('No results found');return;}
  alert(`Found ${results.length} result(s):\n\n`+results.slice(0,8).map(m=>`[${m.time||''}] ${m.from||'?'}: ${m.text||''}`).join('\n'));
}

// ── MENU ─────────────────────────────────────────────────────────────────
function openMenu(){
  const c=prompt('1. Edit Profile\n2. Set Online\n3. Set Away\n4. Set Busy\n\nEnter number:');
  if(c==='1'){const a=prompt('About:');if(a)wsClient?.updateProfile(a);}
  if(c==='2')wsClient?.setStatus('online');
  if(c==='3')wsClient?.setStatus('away');
  if(c==='4')wsClient?.setStatus('busy');
}

function setTab(tab,btn){
  activeTab=tab;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderChatList();
}

// ── GLOBAL CLICK HANDLERS ─────────────────────────────────────────────────
document.addEventListener('click',e=>{
  if(!e.target.closest('#attachMenu')&&!e.target.closest('[data-attach]'))
    $('attachMenu')?.classList.remove('show');
  if(!e.target.closest('#emojiPicker')&&!e.target.closest('[data-emoji]'))
    $('emojiPicker')?.classList.remove('show');
  if(!e.target.closest('#ctxMenu'))
    $('ctxMenu')?.classList.remove('show');
});
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o&&o.id!=='loginModal')closeModal(o.id);});
});
