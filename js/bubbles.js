function buildBubble(msg,currentUser,isGroup){
  if(msg.type==='system'){const d=document.createElement('div');d.className='sys-msg';d.textContent=msg.text;return d;}
  if(msg.type==='reaction_display'){
    const row=document.createElement('div'); row.className='msg-row '+(msg.isMe?'me':'them');
    const rb=document.createElement('div'); rb.className='react-bubble';
    rb.innerHTML=`<span class="react-emoji">${msg.emoji}</span><span>${esc(msg.isMe?'You reacted':msg.from+' reacted')}</span>`;
    row.appendChild(rb); return row;
  }
  if(msg.type!=='message'&&msg.type!=='file') return null;
  const row=document.createElement('div'); row.className='msg-row '+(msg.isMe?'me':'them');
  const bbl=document.createElement('div'); bbl.className='bubble '+(msg.isMe?'me':'them');
  bbl.dataset.msgId=msg.id||msg.msg_id||''; bbl.dataset.text=msg.text||msg.filename||''; bbl.dataset.sender=msg.from||'';
  bbl.addEventListener('contextmenu',e=>{e.preventDefault();window._ctxMsg=msg;const cm=document.getElementById('ctxMenu');cm.style.left=Math.min(e.pageX,window.innerWidth-170)+'px';cm.style.top=Math.min(e.pageY,window.innerHeight-160)+'px';cm.classList.add('show');});
  if(!msg.isMe&&isGroup){const sn=document.createElement('div');sn.className='sender-name';sn.textContent=msg.from||'?';bbl.appendChild(sn);}
  if(msg.reply_to||msg.replyTo){const rq=document.createElement('div');rq.className='reply-quote';rq.textContent='↩ '+String(msg.reply_to||msg.replyTo).slice(0,60);bbl.appendChild(rq);}
  let content;
  if(msg.type==='file') content=buildFileContent(msg);
  else if((msg.text||'').startsWith('📍')) content=buildLocContent(msg.text);
  else if((msg.text||'').startsWith('👤')) content=buildConContent(msg.text);
  else{const t=document.createElement('div');t.className='msg-text';t.textContent=msg.text||'';content=t;}
  bbl.appendChild(content);
  const foot=document.createElement('div'); foot.className='msg-footer';
  const ti=document.createElement('span'); ti.className='msg-time'; ti.textContent=msg.time||''; foot.appendChild(ti);
  if(msg.isMe){const tk=document.createElement('span');tk.className='ticks';tk.textContent='✓✓';foot.appendChild(tk);}
  bbl.appendChild(foot); row.appendChild(bbl); return row;
}

function buildFileContent(msg){
  const fname=msg.filename||'file',ext=fname.split('.').pop().toUpperCase(),sz=fmtSize(msg.size||0),ftype=msg.file_type||'other',url=msg.fileURL||null;
  if(ftype==='image'&&url){
    const w=document.createElement('div'); w.className='img-bubble';
    const img=document.createElement('img'); img.src=url; img.alt=fname; img.onclick=()=>window.open(url);
    const cap=document.createElement('div'); cap.className='img-caption'; cap.textContent=fname+' • '+sz;
    w.appendChild(img); w.appendChild(cap); return w;
  }
  if(ftype==='audio'&&url){
    const bars=Array.from({length:22},(_,i)=>`<span style="height:${4+Math.round(Math.abs(Math.sin(i*1.4)*16))}px"></span>`).join('');
    const w=document.createElement('div'); w.className='audio-bubble'; w.onclick=()=>new Audio(url).play();
    w.innerHTML=`<div class="audio-play">▶</div><div class="audio-info"><div class="audio-name">${esc(fname)}</div><div class="waveform">${bars}</div><div class="audio-size">${sz}</div></div>`;
    return w;
  }
  if(ftype==='video'&&url){
    const w=document.createElement('div'); w.style.cssText='border-radius:8px;overflow:hidden;max-width:280px';
    const vid=document.createElement('video'); vid.src=url; vid.controls=true; vid.style.cssText='width:100%;display:block;border-radius:8px';
    const cap=document.createElement('div'); cap.style.cssText='font-size:11px;color:var(--ts);padding:3px 8px;background:#0b1f2e'; cap.textContent=fname+' • '+sz;
    w.appendChild(vid); w.appendChild(cap); return w;
  }
  const bc=FILE_BADGE_COLORS[ext]||'#53bdeb';
  const card=document.createElement('div'); card.className='file-card';
  if(url) card.onclick=()=>window.open(url);
  card.innerHTML=`<div class="file-card-row"><div class="file-badge" style="background:${bc}">${ext.slice(0,4)}</div><div class="file-info"><div class="file-name">${esc(fname)}</div><div class="file-meta">${ext} • ${sz}</div></div><span class="file-arrow">↗</span></div><div class="file-hint">🖱 Click to open</div>`;
  return card;
}

function buildLocContent(text){
  const parts=text.split('|'),locName=parts[0].replace('📍 Location:','').replace('📍','').trim();
  const mapsUrl=(parts.find(p=>p.includes('maps.google'))||'').replace('Maps:','').trim();
  const w=document.createElement('div'); w.className='loc-card';
  w.innerHTML=`<div class="loc-map">🗺</div><div class="loc-detail"><div class="loc-name">📍 ${esc(locName)}</div>${mapsUrl?`<button class="loc-btn" onclick="window.open('${esc(mapsUrl)}')">Open in Google Maps →</button>`:''}</div>`;
  return w;
}

function buildConContent(text){
  const lines=text.split('|').map(l=>l.trim()).filter(Boolean);
  const w=document.createElement('div'); w.className='contact-card';
  w.innerHTML=`<span style="font-size:28px">👤</span><div>${lines.map(l=>`<div style="font-size:${l.includes('Contact:')?'13':'12'}px;color:${l.includes('Contact:')?'var(--tw)':'var(--ts)'};margin-bottom:2px">${esc(l)}</div>`).join('')}</div>`;
  return w;
}
