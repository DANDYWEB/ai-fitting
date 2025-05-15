/* ───────────────── 상수 & 전역 ───────────────── */
const FN   = "/.netlify/functions";

const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const file = document.getElementById("personPhoto");
const prev = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");
const dlBtn= document.getElementById("dlBtn");   // 새 버튼

let CLOTHES = [];
let selected = [];
let cat      = "all";
let lastImgUrl = "";                            // 다운로드용 URL

/* 다운로드 버튼 초기 비활성 */
dlBtn.style.display = "none";

/* 다운로드 클릭 이벤트 (질문에서 주신 코드 그대로) */
dlBtn.addEventListener("click", async ()=>{
  if(!lastImgUrl) return;
  try{
    /* 이미지를 Blob 으로 가져와서 실제 파일로 저장 */
    const blob   = await fetch(lastImgUrl,{mode:"cors"}).then(r=>r.blob());
    const urlObj = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = urlObj;
    a.download   = "ai-fitting-result.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(urlObj);
  }catch(e){
    alert("다운로드 실패: "+e.message);
  }
});

/* ───────────────── 1. 의류 목록 로드 ───────────────── */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => { CLOTHES = j.items || []; renderGrid(); })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ───────────────── 2. 그리드 렌더 ───────────────── */
function renderGrid(){
  grid.innerHTML = "";
  CLOTHES
    .filter(c => cat === "all" || c.cat === cat)
    .forEach(c => {
      const d = document.createElement("div");
      d.className = "clothing-item" + (selected.includes(c.id) ? " selected" : "");
      d.dataset.id = c.id;
      d.innerHTML =
        `<img src="${c.src}">
         <div class="item-info">${c.name}</div>`;
      grid.appendChild(d);
    });
}

/* ───────────────── 3. 탭 & 선택 ───────────────── */
tabs.addEventListener("click", e => {
  const li = e.target.closest("li"); if (!li) return;
  cat = li.dataset.cat;
  [...tabs.children].forEach(v => v.classList.toggle("active", v === li));
  renderGrid();
});

grid.addEventListener("click", e => {
  const it = e.target.closest(".clothing-item"); if (!it) return;
  const id = +it.dataset.id;
  if (selected.includes(id)) selected = selected.filter(v => v !== id);
  else {
    if (selected.length === 2){ alert("의류는 최대 2개"); return; }
    selected.push(id);
  }
  renderGrid(); updateBtn();
});

/* ───────────────── 4. 인물 미리보기 ───────────────── */
file.addEventListener("change", () => {
  const f = file.files[0];
  if (f){
    const fr = new FileReader();
    fr.onload = e => (prev.innerHTML = `<img src="${e.target.result}" style="width:100%">`);
    fr.readAsDataURL(f);
  }
  updateBtn();
});

function updateBtn(){ btn.disabled = !(file.files[0] && selected.length); }

/* ───────────────── 5. 유틸 ───────────────── */
// URL → Base64
const imgToBase64 = url => fetch(url).then(r => r.blob()).then(b => new Promise(res=>{
  const fr=new FileReader(); fr.onloadend=()=>res(fr.result.split(',')[1]); fr.readAsDataURL(b);
}));

// 1270px 이하, 원본 포맷 유지 압축
function fileToBase64Compressed(f){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=1270;
      const scale=Math.min(1,MAX/Math.max(img.width,img.height));
      const c=document.createElement("canvas");
      c.width=Math.round(img.width*scale);
      c.height=Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      const mime=f.type||"image/jpeg";
      const quality=mime==="image/jpeg"?0.85:undefined;
      c.toBlob(b=>{
        const fr=new FileReader();
        fr.onloadend=()=>res(fr.result.split(',')[1]);
        fr.readAsDataURL(b);
      },mime,quality);
    };
    img.src=URL.createObjectURL(f);
  });
}

// 두 이미지 병합
const loadImg=s=>new Promise(r=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>r(i);i.src=s;});
async function mergeTwo(a,b){
  const A=await loadImg(`data:image/png;base64,${a}`);
  const B=await loadImg(`data:image/png;base64,${b}`);
  const c=document.createElement("canvas");
  c.width=A.width+B.width; c.height=Math.max(A.height,B.height);
  const ctx=c.getContext("2d"); ctx.drawImage(A,0,0); ctx.drawImage(B,A.width,0);
  return c.toDataURL("image/jpeg",0.85).split(',')[1];
}

/* ───────────────── 6. Generate 클릭 ───────────────── */
btn.addEventListener("click", async()=>{
  btn.disabled=true; btn.textContent="Generating…";
  box.innerHTML = YT_IFRAME;           // 대기 영상 표시
  dlBtn.style.display="none";          // 이전 다운로드 버튼 숨김
  lastImgUrl = "";

  try{
    const human=await fileToBase64Compressed(file.files[0]);
    const clothImgs=await Promise.all(
      selected.map(id=>imgToBase64(CLOTHES.find(c=>c.id===id).src))
    );
    const cloth=clothImgs.length===2 ? await mergeTwo(clothImgs[0],clothImgs[1]) : clothImgs[0];

    const r=await fetch(`${FN}/generate`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({human_image:human, cloth_image:cloth})
    });
    if(!r.ok) throw new Error(await r.text());
    const {task_id}=await r.json();
    poll(task_id,0);

  }catch(e){ alert(e.message); reset(); }
});

/* ───────────────── 7. Poll (간격 8초 유지) ───────────────── */
async function poll(id,n){
  const res=await fetch(`${FN}/task?id=${id}`);
  if(!res.ok){ reset("Task 조회 실패"); return; }

  const d=await res.json();
  if(!d.task_status){
    if(n<40){setTimeout(()=>poll(id,n+1),8000);return;}
    reset("결과를 가져오지 못했습니다"); return;
  }
  if(d.task_status==="succeed"){
    const url=d.image_url||d.result_url||d.task_result?.images?.[0]?.url;
    if(!url){ reset("URL 없음"); return; }
    box.innerHTML=`<img src="${url}" style="width:100%;border-radius:var(--radius)">`;

    /* 성공 시: 다운로드 준비 */
    lastImgUrl = url;
    dlBtn.style.display = "block";

    reset(); return;
  }
  if(d.task_status==="failed"){ reset("생성 실패"); return; }

  if(n<40) setTimeout(()=>poll(id,n+1),8000);
  else     reset("타임아웃");
}

/* ───────────────── 8. reset ───────────────── */
function reset(msg){
  if(msg) alert(msg);
  btn.disabled=false;
  btn.textContent="Generate Image";

  /* 다운로드 상태 초기화 */
  if(!lastImgUrl){
    dlBtn.style.display="none";
  }
}
