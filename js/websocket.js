class WSClient {
  constructor(onMessage){
    this.ws=null; this.onMsg=onMessage; this.username=null;
    this._pendingRoom='General'; this._authPayload=null;
  }
  connect(url,username,password,action,about,room){
    this.username=username; this._pendingRoom=room||'General';
    this._authPayload={type:'auth',username,password,action,about};
    const err=document.getElementById('loginErr');
    const setErr=msg=>{if(err){err.innerHTML=msg;err.style.color='var(--red)';}};
    try{ this.ws=new WebSocket(url); }
    catch(e){ setErr('❌ Invalid URL. Use ws://127.0.0.1:9090'); return; }
    const timeout=setTimeout(()=>{
      if(this.ws&&this.ws.readyState!==1)
        setErr('❌ Cannot connect.<br><small>Run <b>python server.py</b> then open <b>http://localhost:8080</b></small>');
    },4000);
    this.ws.onopen=()=>{ clearTimeout(timeout); this.send(this._authPayload); };
    this.ws.onmessage=e=>{ try{this.onMsg(JSON.parse(e.data));}catch{} };
    this.ws.onclose=ev=>{
      clearTimeout(timeout);
      if(ev.code===1006){
        const loginOpen=document.getElementById('loginModal')?.classList.contains('show');
        if(loginOpen) setErr('❌ Server not reachable.<br><small>Run <b>python server.py</b> then open <b>http://localhost:8080</b></small>');
        else showConnBar('⚠ Disconnected — refresh page');
      }
    };
    this.ws.onerror=()=>{ clearTimeout(timeout); setErr('❌ Connection failed.<br><small>Run <b>python server.py</b> then open <b>http://localhost:8080</b></small>'); };
  }
  send(obj){if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(obj));}
  sendMsg(text,to,replyTo){this.send({type:'message',text,...(to&&{to}),...(replyTo&&{reply_to:replyTo})});}
  sendFile(filename,size,fileType,b64,to){this.send({type:'file',filename,size,file_type:fileType,data:b64,...(to&&{to})});}
  sendReaction(emoji){this.send({type:'reaction',emoji});}
  sendTyping(){this.send({type:'typing'});}
  sendStopTyping(){this.send({type:'stop_typing'});}
  sendReadReceipt(id,from){this.send({type:'msg_read',msg_id:id,original_sender:from});}
  setStatus(s){this.send({type:'status_update',status:s});}
  updateProfile(about){this.send({type:'update_profile',about});}
  createGroup(name,members){this.send({type:'create_group',name,members});}
  deleteMessage(id){this.send({type:'delete_message',msg_id:id});}
  getUsers(){this.send({type:'get_users'});}
  joinRoom(room){this.send({type:'join',room});}
  callRequest(to,ct){this.send({type:'call_request',to,call_type:ct});}
  callAccept(id){this.send({type:'call_accept',call_id:id});}
  callReject(id){this.send({type:'call_reject',call_id:id});}
  callEnd(id){this.send({type:'call_end',call_id:id});}
}
