/* ───────── 상수 & 전역 ───────── */
const FN   = "/.netlify/functions";          // Netlify Functions base URL
const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const file = document.getElementById("personPhoto");
const prev = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");
const ad   = document.getElementById("adContainer");

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
  CLOTHES.filter(c => cat === "all" || c.cat === cat).forEach(c => {
    const d = document.createElement("div");
    d.className = "clothing-item" + (selected.includes(c.id) ? " selected" : "");
    d.dataset.id = c.id;
    d.innerHTML =
      `<img src="${c.src}">
       <div class="item-info">${c.name}</div>`;
    grid.appendChild(d);
  });
}

/* ───────── 3. 탭/의류 선택 ───────── */
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

/* ───────── 4. 인물 미리보기 ───────── */
file.addEventListener("change", () => {
  const f = file.files[0];
  if (f) {
    const fr = new FileReader();
    fr.onload = e => (prev.innerHTML = `<img src="${e.target.result}" style="width:100%">`);
    fr.readAsDataURL(f);
  }
  updateBtn();
});
function updateBtn() { btn.disabled = !(file.files[0] && selected.length); }

/* ───────── 5. 사람 이미지 압축(≤1270px, 원본형식) ───────── */
function fileToBase64Compressed(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));

      const cvs = document.createElement("canvas");
      cvs.width  = img.width * scale;
      cvs.height = img.height * scale;
      cvs.getContext("2d").drawImage(img, 0, 0, cvs.width, cvs.height);

      const mime = file.type || "image/jpeg";
      const q    = mime === "image/jpeg" ? 0.85 : undefined;

      cvs.toBlob(b => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(b);
      }, mime, q);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ───────── 6. 의류 이미지 Base64 ───────── */
const imgToB64 = u => fetch(u).then(r => r.blob()).then(b => new Promise(res=>{
  const fr = new FileReader(); fr.onloadend = () => res(fr.result.split(",")[1]); fr.readAsDataURL(b);
}));

/* 2장 병합(JPEG 0.85) */
const loadImg = s => new Promise(r => {const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>r(i); i.src=s;});
async function mergeTwo(a, b) {
  const A = await loadImg(`data:image/png;base64,${a}`);
  const B = await loadImg(`data:image/png;base64,${b}`);
  const cvs = document.createElement("canvas");
  cvs.width = A.width + B.width; cvs.height = Math.max(A.height, B.height);
  const ctx = cvs.getContext("2d");
  ctx.drawImage(A, 0, 0); ctx.drawImage(B, A.width, 0);
  return cvs.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/* ───────── 7. AdMob 배너 표시/숨김 ───────── */
function showAd() {
  ad.classList.remove("hidden");
  if (window.admob?.start) {
    admob.start().then(() => {
      admob.Banner.show({
        adUnitId: "ca-app-pub-3940256099942544/1033173712", // ★ 실제 배너 ID로 교체
        position: "bottom"
      }).catch(console.warn);
    });
  }
}
function hideAd() {
  ad.classList.add("hidden");
  if (window.admob?.Banner?.hide) admob.Banner.hide().catch(console.warn);
}

/* ───────── 8. Generate 클릭 ───────── */
btn.addEventListener("click", async () => {
  btn.disabled = true; btn.textContent = "Generating…";
  showAd();   // 광고 표시
  try {
    const human = await fileToBase64Compressed(file.files[0]);
    const clothImgs = await Promise.all(selected.map(id => imgToB64(CLOTHES.find(c=>c.id===id).src)));
    const cloth = clothImgs.length === 2 ? await mergeTwo(clothImgs[0], clothImgs[1]) : clothImgs[0];

    const g = await fetch(`${FN}/generate`, {
      method : "POST",
      headers: { "Content-Type":"application/json" },
      body   : JSON.stringify({ human_image:human, cloth_image:cloth })
    });
    if(!g.ok) throw new Error("Generate 실패: "+await g.text());
    const j = await g.json();
    poll(j.task_id, 0);
  } catch (e) {
    alert(e.message); reset();
  }
});

/* ───────── 9. 결과 폴링 ───────── */
async function poll(id, n) {
  const r = await fetch(`${FN}/task?id=${id}`);
  if(!r.ok){ reset("Task 조회 실패 "+r.status); return; }

  const d = await r.json();
  if(!d.task_status){
    if(n<40){ setTimeout(()=>poll(id,n+1),8000); return; }
    reset("결과를 가져오지 못했습니다"); return;
  }

  if(d.task_status==="succeed"){
    const url = d.image_url || d.result_url || d.task_result?.images?.[0]?.url;
    if(!url){ reset("URL을 찾지 못했습니다"); return; }
    box.innerHTML = `<img src="${url}" style="width:100%">`;
    hideAd();
    reset(); return;
  }
  if(d.task_status==="failed"){ hideAd(); reset("생성 실패"); return; }

  if(n<40) setTimeout(()=>poll(id,n+1),8000);
  else     { hideAd(); reset("타임아웃"); }
}

function reset(msg){
  if(msg) alert(msg);
  btn.disabled = false;
  btn.textContent = "Generate Image";
}
