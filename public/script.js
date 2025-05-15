/* ───────── 상수 & 전역 ───────── */
const FN    = "/.netlify/functions";
const tabs  = document.getElementById("categoryTabs");
const grid  = document.getElementById("clothingGrid");
const file  = document.getElementById("personPhoto");
const prev  = document.getElementById("photoPreview");
const btn   = document.getElementById("generateBtn");
const box   = document.getElementById("resultBox");
const adBox = document.getElementById("adBox");

let CLOTHES = [];
let selected = [];
let cat = "all";

/* ───────── 1. 의류 목록 로드 ───────── */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => { CLOTHES = j.items || []; renderGrid(); })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ───────── 2. 그리드 렌더 ───────── */
function renderGrid() {
  grid.innerHTML = "";
  CLOTHES
    .filter(c => cat === "all" || c.cat === cat)
    .forEach(c => {
      const d = document.createElement("div");
      d.className = "clothing-item" + (selected.includes(c.id) ? " selected" : "");
      d.dataset.id = c.id;
      d.innerHTML = `
        <img src="${c.src}">
        <div class="item-info">${c.name}</div>`;
      grid.appendChild(d);
    });
}

/* ───────── 3. 탭 & 선택 ───────── */
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
    if (selected.length === 2) { alert("의류는 최대 2개"); return; }
    selected.push(id);
  }
  renderGrid(); updateBtn();
});

/* ───────── 4. 인물 사진 미리보기 ───────── */
file.addEventListener("change", () => {
  const f = file.files[0];
  if (f) {
    const fr = new FileReader();
    fr.onload = e => prev.innerHTML = `<img src="${e.target.result}" style="width:100%">`;
    fr.readAsDataURL(f);
  }
  updateBtn();
});
function updateBtn() { btn.disabled = !(file.files[0] && selected.length); }

/* ───────── 5. Helper: Base64 변환 ───────── */
// 1270px 이하 & 원본 MIME 유지
function fileToBase64Compressed(f) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const mime = f.type || "image/jpeg";
      const quality = mime === "image/jpeg" ? 0.85 : undefined;
      c.toBlob(b => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(b);
      }, mime, quality);
    };
    img.src = URL.createObjectURL(f);
  });
}
const imgURLtoBase64 = u => fetch(u).then(r=>r.blob()).then(b=>new Promise(r=>{
  const fr=new FileReader(); fr.onloadend=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(b);
}));
const loadImg = s => new Promise(r=>{const i=new Image(); i.onload=()=>r(i); i.crossOrigin="anonymous"; i.src=s;});
async function mergeTwo(a,b){
  const A=await loadImg(`data:image/png;base64,${a}`);
  const B=await loadImg(`data:image/png;base64,${b}`);
  const c=document.createElement("canvas");
  c.width=A.width+B.width; c.height=Math.max(A.height,B.height);
  c.getContext("2d").drawImage(A,0,0); c.getContext("2d").drawImage(B,A.width,0);
  return c.toDataURL("image/jpeg",0.85).split(',')[1];
}

/* ───────── 6. Generate 클릭 ───────── */
btn.addEventListener("click", async () => {
  btn.disabled = true; btn.textContent = "Generating…";

  /* 광고 표시 & 새 광고 요청 */
  adBox.style.display = "block";
  (adsbygoogle = window.adsbygoogle || []).push({});

  try {
    const humanB64 = await fileToBase64Compressed(file.files[0]);

    const clothB64Arr = await Promise.all(
      selected.map(id => imgURLtoBase64(CLOTHES.find(c=>c.id===id).src))
    );
    const clothB64 = clothB64Arr.length === 2
      ? await mergeTwo(clothB64Arr[0], clothB64Arr[1])
      : clothB64Arr[0];

    /* generate 함수 호출 */
    const gen = await fetch(`${FN}/generate`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ human_image: humanB64, cloth_image: clothB64 })
    });
    if (!gen.ok) throw new Error("Generate 오류: " + await gen.text());
    const { task_id } = await gen.json();
    poll(task_id, 0);

  } catch (e) {
    alert(e.message); reset(true);
  }
});

/* ───────── 7. 결과 폴링 ───────── */
async function poll(id,n){
  const res = await fetch(`${FN}/task?id=${id}`);
  if(!res.ok){ reset(true,"Task 조회 실패"); return; }

  const d = await res.json();
  if(!d || !d.task_status){
    if(n<40){ setTimeout(()=>poll(id,n+1),8000); return; }
    reset(true,"결과를 가져오지 못했습니다"); return;
  }

  if(d.task_status==="succeed"){
    const url = d.image_url || d.result_url || d.task_result?.images?.[0]?.url;
    if(!url){ reset(true,"URL을 찾지 못했습니다"); return; }
    box.innerHTML = `<img src="${url}" style="width:100%">`;
    reset(true); return;
  }

  if(d.task_status==="failed"){ reset(true,"생성 실패"); return; }

  if(n<40) setTimeout(()=>poll(id,n+1),8000);
  else reset(true,"타임아웃");
}

/* ───────── 8. Reset ───────── */
function reset(hideAd,msg){
  if(msg) alert(msg);
  if(hideAd) adBox.style.display = "none";
  btn.disabled = false;
  btn.textContent = "Generate Image";
}
