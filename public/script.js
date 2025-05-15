/* ─────────────────────────── 상수 & DOM ─────────────────────────── */
const FN    = "/.netlify/functions";
const tabs  = document.getElementById("categoryTabs");
const grid  = document.getElementById("clothingGrid");
const file  = document.getElementById("personPhoto");
const prev  = document.getElementById("photoPreview");
const btn   = document.getElementById("generateBtn");
const box   = document.getElementById("resultBox");
const downloadBtn = document.getElementById("downloadBtn");

let CLOTHES    = [];
let selected   = [];
let cat        = "all";
let lastImgUrl = "";

/* YouTube 대기 영상 (소리 ON · 컨트롤 없음 · 루프) */
const YT_ID     = "GN9zAbqRFKU";
const YT_IFRAME = `
  <iframe
    src="https://www.youtube.com/embed/${YT_ID}?autoplay=1&mute=0&controls=0&loop=1&playlist=${YT_ID}&modestbranding=1&playsinline=1"
    frameborder="0"
    allow="autoplay; encrypted-media"
    style="width:100%;height:100%;border-radius:var(--radius)"
    title="Generating..."
  ></iframe>`;

/* ─────────────────────── 다운로드 버튼 show/hide 헬퍼 ─────────────────────── */
function showDownload() {
  downloadBtn.classList.add("show");
}
function hideDownload() {
  downloadBtn.classList.remove("show");
}

/* ─────────────────────────── 초기화 ─────────────────────────── */
// 페이지 로드 직후 Generate 비활성, Download 숨김
btn.disabled = true;
hideDownload();

/* ──────────────────────── 1. 의류 목록 로드 ──────────────────────── */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => { CLOTHES = j.items || []; renderGrid(); })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ──────────────────────── 2. 그리드 렌더 ───────────────────────── */
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

/* ──────────────────────── 3. 탭 & 선택 ─────────────────────────── */
tabs.addEventListener("click", e => {
  const li = e.target.closest("li"); if (!li) return;
  cat = li.dataset.cat;
  [...tabs.children].forEach(v => v.classList.toggle("active", v === li));
  renderGrid();
});

grid.addEventListener("click", e => {
  const it = e.target.closest(".clothing-item"); if (!it) return;
  const id = +it.dataset.id;
  if (selected.includes(id)) {
    selected = selected.filter(v => v !== id);
  } else {
    if (selected.length === 2) { alert("의류는 최대 2개"); return; }
    selected.push(id);
  }
  renderGrid();
  updateBtn();
});

/* ──────────────────────── 4. 인물 미리보기 ─────────────────────── */
file.addEventListener("change", () => {
  const f = file.files[0];
  if (f) {
    const fr = new FileReader();
    fr.onload = e => prev.innerHTML = `<img src="${e.target.result}" style="width:100%">`;
    fr.readAsDataURL(f);
  }
  updateBtn();
});

/* ──────────────────────── Generate 버튼 활성화 ─────────────────────── */
function updateBtn() {
  btn.disabled = !(file.files[0] && selected.length);
}

/* ──────────────────────── 5. 유틸 함수 ─────────────────────────── */
// 이미지 URL → Base64
const imgToBase64 = url => fetch(url)
  .then(r => r.blob())
  .then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onloadend = () => res(fr.result.split(",")[1]);
    fr.readAsDataURL(b);
  }));

// 최대 1270px & 원본 포맷 유지 압축
function fileToBase64Compressed(f) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width  = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const mime = f.type || "image/jpeg";
      const quality = mime === "image/jpeg" ? 0.85 : undefined;
      c.toBlob(blob => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(blob);
      }, mime, quality);
    };
    img.src = URL.createObjectURL(f);
  });
}

// 두 의류 이미지 합치기
const loadImg = src => new Promise(r => {
  const i = new Image();
  i.crossOrigin = "anonymous";
  i.onload = () => r(i);
  i.src = src;
});
async function mergeTwo(a, b) {
  const A = await loadImg(`data:image/png;base64,${a}`);
  const B = await loadImg(`data:image/png;base64,${b}`);
  const c = document.createElement("canvas");
  c.width = A.width + B.width;
  c.height = Math.max(A.height, B.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(A, 0, 0);
  ctx.drawImage(B, A.width, 0);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/* ──────────────────────── 6. Generate 클릭 ─────────────────────── */
btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "Generating…";

  box.innerHTML = YT_IFRAME;
  hideDownload();
  lastImgUrl = "";

  try {
    const human     = await fileToBase64Compressed(file.files[0]);
    const clothImgs = await Promise.all(
      selected.map(id => imgToBase64(CLOTHES.find(c => c.id === id).src))
    );
    const cloth = clothImgs.length === 2
      ? await mergeTwo(clothImgs[0], clothImgs[1])
      : clothImgs[0];

    const resp = await fetch(`${FN}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_image: human, cloth_image: cloth })
    });
    if (!resp.ok) throw new Error(await resp.text());
    const { task_id } = await resp.json();

    poll(task_id, 0);
  } catch (e) {
    alert(e.message);
    reset();
  }
});

/* ──────────────────────── 7. Poll (3초 간격) ─────────────────────── */
async function poll(id, n) {
  const r = await fetch(`${FN}/task?id=${id}`);
  if (!r.ok) { reset("Task 조회 실패"); return; }

  const d = await r.json();
  if (!d.task_status) {
    if (n < 40) { setTimeout(() => poll(id, n + 1), 3000); return; }
    reset("결과를 가져오지 못했습니다"); return;
  }
  if (d.task_status === "succeed") {
    const url = d.image_url || d.result_url || d.task_result?.images?.[0]?.url;
    if (!url) { reset("URL 없음"); return; }

    lastImgUrl = url;
    box.innerHTML = `<img src="${url}" style="width:100%;border-radius:var(--radius)">`;

    downloadBtn.href = url;
    showDownload();

    reset();
    return;
  }
  if (d.task_status === "failed") { reset("생성 실패"); return; }
  if (n < 40) setTimeout(() => poll(id, n + 1), 3000);
  else reset("타임아웃");
}

/* ──────────────────────── 8. reset ───────────────────────────── */
function reset(msg) {
  if (msg) alert(msg);
  btn.disabled = !(file.files[0] && selected.length);
  btn.textContent = "Generate Image";
  hideDownload();
  lastImgUrl = "";
}

/* ──────────────────────── 9. 다운로드 로직 ───────────────────── */
downloadBtn.addEventListener("click", async () => {
  if (!lastImgUrl) return;
  try {
    const blob   = await fetch(lastImgUrl, { mode: "cors" }).then(r => r.blob());
    const urlObj = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = urlObj;
    a.download   = "ai-fitting-result.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(urlObj);
  } catch (e) {
    alert("다운로드 실패: " + e.message);
  }
});
