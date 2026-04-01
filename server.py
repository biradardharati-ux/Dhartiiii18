"""
ChatNet WebSocket Server
Run: python server.py
Then open: http://localhost:8080
Install: pip install websockets
"""
import asyncio, websockets, json, os, base64, hashlib, datetime
import http.server, threading, socketserver

HOST      = "0.0.0.0"
WS_PORT   = 9090
HTTP_PORT = 8080
UPLOAD_DIR = "server_files"
os.makedirs(UPLOAD_DIR, exist_ok=True)

clients={};rooms={};users_db={};user_status={};active_calls={};msg_history={}

def ts():      return datetime.datetime.now().strftime("%H:%M:%S")
def dts():     return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
def hp(p):     return hashlib.sha256(p.encode()).hexdigest()

async def sx(ws, d):
    try: await ws.send(json.dumps(d))
    except: pass

async def bc(d, room, ex=None):
    for u in list(rooms.get(room,set())):
        if u==ex: continue
        w=clients.get(u)
        if w: await sx(w,d)

async def st(u, d):
    w=clients.get(u)
    if w: await sx(w,d); return True
    return False

def sm(room, msg):
    msg_history.setdefault(room,[]).append(msg)
    if len(msg_history[room])>200: msg_history[room]=msg_history[room][-200:]

async def handler(ws):
    username=room=None
    try:
        async for raw in ws:
            try: pkt=json.loads(raw)
            except: continue
            t=pkt.get("type")

            if t=="auth":
                username=pkt.get("username","").strip()
                password=pkt.get("password","")
                action=pkt.get("action","login")
                about=pkt.get("about","Hey there!")
                if not username or not password:
                    await sx(ws,{"type":"auth_fail","reason":"Empty credentials"}); return
                h=hp(password)
                if action=="register":
                    if username in users_db:
                        await sx(ws,{"type":"auth_fail","reason":"Username already taken"}); return
                    users_db[username]={"password":h,"about":about,"last_seen":dts()}
                else:
                    if username not in users_db:
                        await sx(ws,{"type":"auth_fail","reason":"User not found — click NEW ACCOUNT first"}); return
                    if users_db[username]["password"]!=h:
                        await sx(ws,{"type":"auth_fail","reason":"Wrong password"}); return
                if username in clients:
                    await sx(ws,{"type":"auth_fail","reason":"Already logged in elsewhere"}); return
                clients[username]=ws; user_status[username]="online"
                await sx(ws,{"type":"auth_ok","username":username})
                print(f"[+] {username} authenticated")

            elif t=="join":
                room=pkt.get("room","General").strip() or "General"
                rooms.setdefault(room,set()).add(username)
                await sx(ws,{"type":"join_ok","room":room})
                await bc({"type":"system","text":f"📥 {username} joined","time":ts()},room,ex=username)
                await bc({"type":"user_joined","username":username,"status":"online"},room,ex=username)
                members=sorted(rooms.get(room,set()))
                ui=[{"username":u,"status":user_status.get(u,"online"),
                     "about":users_db.get(u,{}).get("about",""),
                     "last_seen":users_db.get(u,{}).get("last_seen","")} for u in members]
                await sx(ws,{"type":"user_list","users":members,"user_info":ui,"room":room})
                hist=msg_history.get(room,[])
                if hist: await sx(ws,{"type":"message_history","messages":hist,"room":room})
                print(f"[+] {username} joined '{room}'")

            elif t=="message":
                tgt=pkt.get("to")
                mid=f"{username}_{ts().replace(':','')}_{id(pkt)}"
                p2={"type":"message","from":username,"text":pkt.get("text",""),"time":ts(),
                    "private":tgt is not None,"msg_id":mid,
                    "reply_to":pkt.get("reply_to"),"forwarded":pkt.get("forwarded",False)}
                if tgt:
                    tw=clients.get(tgt)
                    if tw:
                        await sx(tw,p2)      # send to receiver
                        await sx(ws,p2)      # echo back to sender (so sender sees ✓✓ ticks)
                    else: await sx(ws,{"type":"system","text":f"⚠ {tgt} is offline","time":ts()})
                else:
                    # Group/room message — broadcast includes sender
                    sm(room,p2); await bc(p2,room)

            elif t=="file":
                fn=pkt.get("filename","unnamed"); b64=pkt.get("data","")
                tgt=pkt.get("to"); fsz=pkt.get("size",0); ft=pkt.get("file_type","other")
                safe=f"{username}_{ts().replace(':','')}_{fn}"
                try:
                    with open(os.path.join(UPLOAD_DIR,safe),"wb") as f: f.write(base64.b64decode(b64))
                except: pass
                p2={"type":"file","from":username,"filename":fn,"size":fsz,
                    "data":b64,"file_type":ft,"time":ts(),"private":tgt is not None}
                if tgt:
                    tw=clients.get(tgt)
                    if tw: await sx(tw,p2)
                    else: await sx(ws,{"type":"system","text":f"⚠ {tgt} is offline","time":ts()})
                else: sm(room,p2); await bc(p2,room,ex=username)

            elif t=="call_request":
                callee=pkt.get("to"); ct=pkt.get("call_type","voice")
                if not callee: continue
                cw=clients.get(callee)
                if not cw:
                    await sx(ws,{"type":"call_rejected","from":callee,"reason":f"{callee} is offline"}); continue
                cid=f"{username}_{callee}_{ts().replace(':','')}"
                active_calls[cid]={"caller":username,"callee":callee,"type":ct}
                await sx(cw,{"type":"incoming_call","from":username,"call_id":cid,"call_type":ct})
                await sx(ws,{"type":"call_ringing","to":callee,"call_id":cid,"call_type":ct})

            elif t=="call_accept":
                cid=pkt.get("call_id"); call=active_calls.get(cid)
                if call:
                    call["status"]="active"; cw=clients.get(call["caller"])
                    if cw: await sx(cw,{"type":"call_accepted","from":username,"call_id":cid,"call_type":call.get("type","voice")})
                    await sx(ws,{"type":"call_accepted","from":call["caller"],"call_id":cid,"call_type":call.get("type","voice")})

            elif t=="call_reject":
                cid=pkt.get("call_id"); call=active_calls.pop(cid,None)
                if call: await st(call["caller"],{"type":"call_rejected","from":username,"reason":"Declined"})

            elif t=="call_end":
                cid=pkt.get("call_id"); call=active_calls.pop(cid,None)
                if call:
                    other=call["callee"] if call["caller"]==username else call["caller"]
                    await st(other,{"type":"call_ended","from":username,"call_id":cid})

            elif t in("audio_chunk","video_chunk"):
                cid=pkt.get("call_id"); call=active_calls.get(cid)
                if call:
                    other=call["callee"] if call["caller"]==username else call["caller"]
                    await st(other,pkt)

            elif t=="status_update":
                user_status[username]=pkt.get("status","online")
                if room: await bc({"type":"user_status","username":username,"status":pkt.get("status","online")},room,ex=username)

            elif t=="typing":
                if room: await bc({"type":"typing","from":username},room,ex=username)

            elif t=="stop_typing":
                if room: await bc({"type":"stop_typing","from":username},room,ex=username)

            elif t=="reaction":
                if room: await bc({"type":"reaction","from":username,"emoji":pkt.get("emoji","👍"),"time":ts()},room,ex=username)

            elif t=="msg_read":
                orig=pkt.get("original_sender")
                if orig: await st(orig,{"type":"msg_read","msg_id":pkt.get("msg_id"),"by":username})

            elif t=="get_users":
                if room:
                    members=sorted(rooms.get(room,set()))
                    ui=[{"username":u,"status":user_status.get(u,"online"),
                         "about":users_db.get(u,{}).get("about",""),
                         "last_seen":users_db.get(u,{}).get("last_seen","")} for u in members]
                    await sx(ws,{"type":"user_list","users":members,"user_info":ui,"room":room})

            elif t=="update_profile":
                ab=pkt.get("about","")
                if username in users_db and ab: users_db[username]["about"]=ab
                await sx(ws,{"type":"system","text":"✅ Profile updated","time":ts()})

            elif t=="create_group":
                gn=pkt.get("name","").strip(); ml=pkt.get("members",[])
                if gn:
                    rooms.setdefault(gn,set()).update(ml+[username])
                    for m in ml: await st(m,{"type":"added_to_group","group":gn,"by":username})
                    await sx(ws,{"type":"system","text":f"✅ Group '{gn}' created","time":ts()})

            elif t=="delete_message":
                if room: await bc({"type":"message_deleted","msg_id":pkt.get("msg_id"),"by":username,"time":ts()},room)

    except websockets.exceptions.ConnectionClosedError: pass
    except Exception as e: print(f"[!] Error ({username}): {e}")
    finally:
        if username:
            clients.pop(username,None); user_status.pop(username,None)
            if username in users_db: users_db[username]["last_seen"]=dts()
            if room and room in rooms:
                rooms[room].discard(username)
                await bc({"type":"system","text":f"📤 {username} left","time":ts()},room)
                await bc({"type":"user_left","username":username},room)
                members=sorted(rooms.get(room,set()))
                await bc({"type":"user_list","users":members,"room":room},room)
            print(f"[-] {username} disconnected")

class QuietHTTP(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass

def run_http():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("",HTTP_PORT),QuietHTTP) as s:
        print(f"[HTTP] Serving on http://localhost:{HTTP_PORT}")
        s.serve_forever()

async def main():
    threading.Thread(target=run_http, daemon=True).start()
    print("="*50)
    print(f"  ChatNet Server Started!")
    print(f"  Open browser: http://localhost:{HTTP_PORT}")
    print(f"  WebSocket:    ws://localhost:{WS_PORT}")
    print("="*50)
    async with websockets.serve(handler, HOST, WS_PORT):
        await asyncio.Future()

if __name__=="__main__":
    asyncio.run(main())
