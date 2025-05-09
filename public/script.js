/* ------------- 상수 & DOM ------------- */
const FN  = "/.netlify/functions";                 // Functions base URL
const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const input= document.getElementById("personPhoto");
const preview = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");

let CLOTHES=[], selected=[], cat="all";

/* ------------- 의류 목록 로드 ------------- */
fetch(`${FN}/clothes`).then(r=>r.json()).then(j=>{
  CLOTHES = j.items; render();
});

/* ------------- 그리드 렌더 ------------- */
function render(){
  grid.innerHTML="";
  CLOTHES.filter(c=>cat==="all"||c.cat===cat).forEach(c=>{
    const d=document.createElement("div");
    d.className="clothing-item"+(selected.includes(c.id)?" selected":"");
    d.dataset.id=c.id;
    d.innerHTML=`<img src="${c.src}">
                 <div class="item-info"><span>${c.name}</span></div>`;
    grid.appendChild(d);
  });
}

/* ------------- 탭 클릭 ------------- */
tabs.addEventListener("click",e=>{
  const li=e.target.closest("li"); if(!li) return;
  cat=li.dataset.cat;
  [...tabs.children].forEach(v=>v.classList.toggle("active",v===li));
  render();
});

/* ------------- 의류 선택 ------------- */
grid.addEventListener("click",e=>{
  const it=e.target.closest(".clothing-item"); if(!it) return;
  const id=+it.dataset.id;
  if(selected.includes(id)) selected=selected.filter(v=>v!==id);
  else{
    if(selected.length===2){alert("최대 2개 선택");return;}
    selected.push(id);
  }
  render(); setBtn();
});

/* ------------- 인물 미리보기 ------------- */
input.addEventListener("change",e=>{
  const f=e.target.files[0];
  if(f){
    const fr=new FileReader();
    fr.onload=ev=>preview.innerHTML=`<img src="${ev.target.result}" style="width:100%">`;
    fr.readAsDataURL(f);
  }
  setBtn();
});
const setBtn=()=>btn.disabled=!(input.files[0]&&selected.length);

/* ------------- 유틸 ------------- */
const imgToBase64=u=>fetch(u).then(r=>r.blob()).then(b=>new Promise(res=>{
  const fr=new FileReader(); fr.onloadend=()=>res(fr.result.split(',')[1]); fr.readAsDataURL(b);
}));
const loadImg=src=>new Promise(r=>{const i=new Image(); i.onload=()=>r(i); i.crossOrigin="anonymous"; i.src=src;});
async function merge(a,b){
  const A=await loadImg(`data:image/png;base64,${a}`);
  const B=await loadImg(`data:image/png;base64,${b}`);
  const c=document.createElement("canvas");
  c.width=A.width+B.width; c.height=Math.max(A.height,B.height);
  c.getContext("2d").drawImage(A,0,0); c.getContext("2d").drawImage(B,A.width,0);
  return c.toDataURL("image/jpeg",0.85).split(',')[1];
}
const fileToBase64=f=>new Promise(r=>{const fr=new FileReader(); fr.onloadend=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(f);});

/* ------------- Generate 클릭 ------------- */
btn.addEventListener("click",async()=>{
  btn.disabled=true; btn.textContent="Generating…";
  try{
    // ① 인물 Base64
    const humanB64=await fileToBase64(input.files[0]);

    // ② 의류 Base64 (1 or 2)
    const imgs=await Promise.all(
      selected.map(id=>imgToBase64(CLOTHES.find(c=>c.id===id).src))
    );
    const clothB64=imgs.length===2?await merge(imgs[0],imgs[1]):imgs[0];

    // ③ 생성 요청
    const resp=await fetch(`${FN}/generate`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ human_image:humanB64, cloth_image:clothB64 })
    }).then(r=>r.json());
    poll(resp.task_id,0);

  }catch(e){
    alert(e.message); reset();
  }
});
function reset(msg){
  if(msg) alert(msg);
  btn.disabled=false; btn.textContent="Generate Image";
}

/* ------------- Poll ------------- */
async function poll(id,n){
  const res = await fetch(`${FN}/task?id=${id}`);

  if(!res.ok){
    reset("Task 조회 실패 "+res.status); return;
  }
  const d = await res.json();        // ← d 가 null 일 수도 있으므로 검사

  if(!d || !d.task_status){
    if(n < 40){ setTimeout(()=>poll(id, n+1), 8000); return; }
    reset("결과를 가져오지 못했습니다"); return;
  }

  if(d.task_status === "succeed"){
    const url=d.task_result.images[0].url;
    box.innerHTML=`<img src="${url}">`;
    reset(); return;
  }
  if(d.task_status==="failed"){reset("생성 실패");return;}
  if(n<40) setTimeout(()=>poll(id,n+1),8000);
  else reset("타임아웃");
}
