/* ───────────── 상수 & 전역 ───────────── */
const FN   = "/.netlify/functions";          // Netlify Functions base URL
const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const file = document.getElementById("personPhoto");
const prev = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");

let CLOTHES = [];
let selected = [];
let cat = "all";

/* ───────────── 1. 의류 목록 로드 ───────────── */
fetch("/clothes.json")                       // build-time JSON
  .then(r => r.json())
  .then(j => { CLOTHES = j.items || []; renderGrid(); })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ───────────── 2. 그리드 렌더 ───────────── */
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

/* ───────────── 3. 탭 & 선택 ───────────── */
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

/* ───────────── 4. 인물 미리보기 ───────────── */
file.addEventListener("change", e => {
  const f = e.target.files[0];
  if (f) {
    const fr = new FileReader();
    fr.onload = ev => (prev.innerHTML = `<img src="${ev.target.result}" style="width:100%">`);
    fr.readAsDataURL(f);
  }
  updateBtn();
});

function updateBtn() { btn.disabled = !(file.files[0] && selected.length); }

/* ───────────── 5. Base64 & 병합 유틸 ───────────── */
const imgToBase64 = u => fetch(u).then(r => r.blob()).then(b => new Promise(res => {
  const fr = new FileReader(); fr.onloadend = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b);
}));
const fileToBase64 = f => new Promise(r => {
  const fr = new FileReader(); fr.onloadend = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f);
});
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.crossOrigin = "anonymous"; i.src = src; });
async function mergeTwo(b1, b2) {
  const A = await loadImg(`data:image/png;base64,${b1}`);
  const B = await loadImg(`data:image/png;base64,${b2}`);
  const c = document.createElement("canvas");
  c.width = A.width + B.width; c.height = Math.max(A.height, B.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(A, 0, 0); ctx.drawImage(B, A.width, 0);
  return c.toDataURL("image/jpeg", 0.85).split(',')[1];
}

/* ───────────── 6. Generate 클릭 ───────────── */
btn.addEventListener("click", async () => {
  btn.disabled = true; btn.textContent = "Generating…";
  try {
    // ① 인물 이미지 Base64
    const human = await fileToBase64(file.files[0]);

    // ② 의류 Base64 (1 또는 2장)
    const imgs = await Promise.all(
      selected.map(id => imgToBase64(CLOTHES.find(c => c.id === id).src))
    );
    const cloth = imgs.length === 2 ? await mergeTwo(imgs[0], imgs[1]) : imgs[0];

    // ③ Generate 함수 호출
    const g = await fetch(`${FN}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_image: human, cloth_image: cloth })
    });
    if (!g.ok) throw new Error("Generate 실패: " + (await g.text()));
    const j = await g.json();
    poll(j.task_id, 0);
  } catch (e) {
    alert(e.message); reset();
  }
});

/* ───────────── 7. 결과 폴링 ───────────── */
async function poll(id, n) {
  const res = await fetch(`${FN}/task?id=${id}`);
  if (!res.ok) { reset("Task 조회 실패 " + res.status); return; }

  const d = await res.json();
  if (!d || !d.task_status) {            // 예상치 못한 구조
    if (n < 40) { setTimeout(() => poll(id, n + 1), 8000); return; }
    reset("결과를 가져오지 못했습니다"); return;
  }

  if (d.task_status === "succeed") {
    /* 여러 위치 중 첫 URL 찾기 */
    const url =
        d.image_url ||
        d.result_url ||
        d.task_result?.images?.[0]?.url ||
        d.task_result?.result_url;
    if (!url) { reset("URL을 찾지 못했습니다"); return; }
    box.innerHTML = `<img src="${url}" style="width:100%">`;
    reset(); return;
  }

  if (d.task_status === "failed") { reset("생성 실패"); return; }

  if (n < 40) setTimeout(() => poll(id, n + 1), 8000);
  else        reset("타임아웃");
}

function reset(msg) {
  if (msg) alert(msg);
  btn.disabled = false;
  btn.textContent = "Generate Image";
}
