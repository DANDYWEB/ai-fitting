/* ── 상수 & 요소 ── */
const FN   = "/.netlify/functions";
const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const file = document.getElementById("personPhoto");
const prev = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");
const dlBtn= document.getElementById("downloadBtn");

let CLOTHES=[], selected=[], cat="all", lastImgUrl=null;

/* YouTube embed (sound ON + loop + no controls) */
const YT_ID="GN9zAbqRFKU";
const YT_IFRAME=`
<iframe src="https://www.youtube.com/embed/${YT_ID}?autoplay=1&controls=0&loop=1&playlist=${YT_ID}&mute=0&modestbranding=1&playsinline=1"
        allow="autoplay; encrypted-media" frameborder="0"></iframe>`;

/* ── 1. 의류 로드 ── */
fetch("/clothes.json").then(r=>r.json())
  .then(j=>{CLOTHES=j.items||[];renderGrid();})
  .catch(e=>alert("의류 로드 실패:"+e.message));

/* ── 2. 그리드 ── */
function renderGrid(){
  grid.innerHTML="";
  CLOTHES.filter(c=>cat==="all"||c.cat===cat).forEach(c=>{
    const d=document.createElement("div");
    d.className="clothing-item"+(selected.includes(c.id)?" selected":"");
    d.dataset.id=c.id;
    d.innerHTML=`<img src="${c.src}"><div class="item-info">${c.name}</div>`;
    grid.appendChild(d);
  });
}

/* ── 3. 탭 & 선택 ── */
tabs.addEventListener("click",e=>{
  const li=e.target.closest("li"); if(!li)return;
  cat=li.dataset.cat;
  [...tabs.children].forEach(v=>v.classList.toggle("active",v===li));
  renderGrid();
});
grid.addEventListener("click",e=>{
  const it=e.target.closest(".clothing-item"); if(!it)return;
  const id=+it.dataset.id;
  if(selected.includes(id)) selected=selected.filter(v=>v!==id);
  else{
    if(selected.length===2){alert("의류는 최대 2개");return;}
    selected.push(id);
  }
  renderGrid(); updateBtn();
});

/* ── 4. 인물 미리보기 ── */
file.addEventListener("change",()=>{
  const f=file.files[0];
  if(f){
    const fr=new FileReader();
    fr.onload=e=>prev.innerHTML=`<img src="${e.target.result}" style="width:100%">`;
    fr.readAsDataURL(f);
  }
  updateBtn();
});

/* ── 5. 버튼 상태 ── */
function updateBtn(){
  btn.disabled=!(file.files[0]&&selected.length);
}

/* ── 6. 유틸 ── */
const imgToBase64=u=>fetch(u).then(r=>r.blob()).then(b=>new Promise(res=>{
  const fr=new FileReader(); fr.onloadend=()=>res(fr.result.split(",")[1]); fr.readAsDataURL(b);
}));
function fileToBase64Compressed(f){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=1270;
      const scale=Math.min(1,MAX/Math.max(img.width,img.height));
      const c=document.createElement("canvas");
      c.width=img.width*scale; c.height=img.height*scale;
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      const mime=f.type||"image/jpeg";
      const q=mime==="image/jpeg"?0.85:undefined;
      c.toBlob(b=>{
        const fr=new FileReader();
        fr.onloadend=()=>res(fr.result.split(",")[1]);
        fr.readAsDataURL(b);
      },mime,q);
    };
    img.src=URL.createObjectURL(f);
  });
}
const loadImg=s=>new Promise(r=>{const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>r(i); i.src=s;});
async function mergeTwo(a,b){
  const A=await loadImg(`data:image/png;base64,${a}`);
  const B=await loadImg(`data:image/png;base64,${b}`);
  const c=document.createElement("canvas");
  c.width=A.width+B.width; c.height=Math.max(A.height,B.height);
  c.getContext("2d").drawImage(A,0,0); c.getContext("2d").drawImage(B,A.width,0);
  return c.toDataURL("image/jpeg",0.85).split(",")[1];
}

/* ── 7. Generate ── */
btn.addEventListener("click",async()=>{
  btn.disabled=true; btn.textContent="Generating…";
  dlBtn.disabled=true; lastImgUrl=null;
  box.innerHTML=YT_IFRAME;

  try{
    const human=await fileToBase64Compressed(file.files[0]);
    const cloths=await Promise.all(selected.map(id=>imgToBase64(CLOTHES.find(c=>c.id===id).src)));
    const clothBase64=cloths.length===2?await mergeTwo(cloths[0],cloths[1]):cloths[0];

    const res=await fetch(`${FN}/generate`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({human_image:human,cloth_image:clothBase64})
    });
    if(!res.ok) throw new Error(await res.text());
    const {task_id}=await res.json();
    poll(task_id,0);

  }catch(e){alert(e.message); reset();}
});

/* ── 8. Poll (3초 간격) ── */
async function poll(id,n){
  const r=await fetch(`${FN}/task?id=${id}`);
  if(!r.ok){reset("Task 조회 실패");return;}
  const d=await r.json();

  if(!d.task_status){
    if(n<40){setTimeout(()=>poll(id,n+1),3000);return;}
    reset("결과를 가져오지 못했습니다");return;
  }

  if(d.task_status==="succeed"){
    const url=d.image_url||d.result_url||d.task_result?.images?.[0]?.url;
    if(!url){reset("URL 없음");return;}
    box.innerHTML=`<img src="${url}" style="width:100%">`;
    lastImgUrl=url;
    dlBtn.disabled=false;
    reset(); return;
  }
  if(d.task_status==="failed"){reset("생성 실패");return;}

  if(n<40) setTimeout(()=>poll(id,n+1),3000);
  else reset("타임아웃");
}

/* ── 9. 이미지 다운로드 ── */
dlBtn.addEventListener("click",()=>{
  if(!lastImgUrl) return;
  const a=document.createElement("a");
  a.href=lastImgUrl;
  a.download="ai-fitting-result.jpg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

/* ── 10. reset ── */
function reset(msg){
  if(msg) alert(msg);
  btn.disabled=false;
  btn.textContent="Generate Image";
}
