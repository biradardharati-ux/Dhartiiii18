function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function nowTs(){return new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function fmtSize(n){if(!n||n===0)return '—';if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
function getFileType(name){const e=name.split('.').pop().toLowerCase();if(['png','jpg','jpeg','gif','bmp','webp'].includes(e))return 'image';if(['mp4','avi','mov','mkv'].includes(e))return 'video';if(['mp3','wav','ogg','m4a','aac'].includes(e))return 'audio';return 'other';}
function getInitial(n){return(n||'?')[0].toUpperCase();}
function scrollBottom(el){setTimeout(()=>el&&(el.scrollTop=el.scrollHeight),40);}
function openModal(id){document.getElementById(id)?.classList.add('show');}
function closeModal(id){document.getElementById(id)?.classList.remove('show');}
function showConnBar(msg){const b=document.getElementById('connBar');if(b){b.textContent=msg;b.classList.add('show');}}
function hideConnBar(){document.getElementById('connBar')?.classList.remove('show');}

// FIX: improved b64ToBlob that returns actual blob with correct size
function b64ToBlob(b64,filename){
  if(!b64) return new Blob([]);
  try{
    const byteStr=atob(b64);
    const arr=new Uint8Array(byteStr.length);
    for(let i=0;i<byteStr.length;i++) arr[i]=byteStr.charCodeAt(i);
    const e=(filename||'').split('.').pop().toLowerCase();
    const mimeMap={
      pdf:'application/pdf',
      doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip:'application/zip',rar:'application/x-rar-compressed',
      txt:'text/plain',csv:'text/csv',
      png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',
      mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',
      mp4:'video/mp4',avi:'video/x-msvideo',mov:'video/quicktime',mkv:'video/x-matroska',
    };
    const mime=mimeMap[e]||'application/octet-stream';
    return new Blob([arr],{type:mime});
  }catch(err){
    console.error('b64ToBlob error:',err);
    return new Blob([]);
  }
}
