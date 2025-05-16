// public/script.js

/* ─────────────────────────── 상수 & DOM ─────────────────────────── */
const FN           = "/.netlify/functions";
const tabs         = document.getElementById("categoryTabs");
const grid         = document.getElementById("clothingGrid");
const fileInput    = document.getElementById("personPhoto");
const previewBox   = document.getElementById("photoPreview");
const generateBtn  = document.getElementById("generateBtn");
const resultBox    = document.getElementById("resultBox");
const downloadBtn  = document.getElementById("downloadBtn");

let CLOTHES    = [];
let selected   = [];
let cat        = "all";
let lastImgUrl = "";

/* privacy-enhanced YouTube iframe (no cookie, autoplay sound, no controls, loop) */
const YT_ID     = "GN9zAbqRFKU";
const YT_IFRAME = `
  <iframe
    src="https://www.youtube-nocookie.com/embed/${YT_ID}?autoplay=1&mute=0&controls=0&loop=1&playlist=${YT_ID}&modestbranding=1&playsinline=1"
    frameborder="0"
    allow="autoplay; encrypted-media"
    style="width:100%;height:100%;border-radius:var(--radius)"
    title="Generating…"
  ></iframe>`;

/* ─────────────────────── 초기 상태 ─────────────────────── */
// Generate 버튼 비활성화
generateBtn.disabled = true;
// Download 버튼 비활성화 (anchor에 disabled 속성 추가)
downloadBtn.disabled = true;   // ★ 비활성화

/* ─────────────────────── 1. 의류 목록 로드 ─────────────────────── */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => {
    CLOTHES = j.items || [];
    renderGrid();
  })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ─────────────────────── 2. 그리드 렌더 ─────────────────────── */
function renderGrid() {
  grid.innerHTML = "";
  CLOTHES
    .filter(c => cat === "all" || c.cat === cat)
    .forEach(c => {
      const div = document.createElement("div");
      div.className = "clothing-item" + (selected.includes(c.id) ? " selected" : "");
      div.dataset.id = c.id;
      div.innerHTML = `
        <img src="${c.src}">
        <div class="item-info">${c.name}</div>`;
      grid.appendChild(div);
    });
}

/* ─────────────────────── 3. 탭 & 선택 ─────────────────────── */
tabs.addEventListener("click", e => {
  const li = e.target.closest("li");
  if (!li) return;
  cat = li.dataset.cat;
  [...tabs.children].forEach(v => v.classList.toggle("active", v === li));
  renderGrid();
});

grid.addEventListener("click", e => {
  const item = e.target.closest(".clothing-item");
  if (!item) return;
  const id = +item.dataset.id;
  if (selected.includes(id)) {
    selected = selected.filter(v => v !== id);
  } else {
    if (selected.length === 2) {
      alert("의류는 최대 2개까지 선택 가능합니다.");
      return;
    }
    selected.push(id);
  }
  renderGrid();
  updateGenerateButton();
});

/* ─────────────────────── 4. 인물 사진 프리뷰 ─────────────────────── */
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    const fr = new FileReader();
    fr.onload = e => {
      previewBox.innerHTML = `<img src="${e.target.result}" style="width:100%">`;
    };
    fr.readAsDataURL(file);
  }
  updateGenerateButton();
});

function updateGenerateButton() {
  generateBtn.disabled = !(fileInput.files[0] && selected.length > 0);
}

/* ─────────────────────── 5. 유틸 함수 ─────────────────────────── */
// URL → Base64
const imgToBase64 = url =>
  fetch(url)
    .then(r => r.blob())
    .then(b => new Promise(res => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result.split(",")[1]);
      fr.readAsDataURL(b);
    }));

// 파일 압축 & 리사이즈 (max 1270px)
function fileToBase64Compressed(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime    = file.type || "image/jpeg";
      const quality = mime === "image/jpeg" ? 0.85 : undefined;
      canvas.toBlob(blob => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(blob);
      }, mime, quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

// 두 의류 이미지 병합
const loadImg = src => new Promise(res => {
  const i = new Image();
  i.crossOrigin = "anonymous";
  i.onload = () => res(i);
  i.src = src;
});
async function mergeTwo(a, b) {
  const A = await loadImg(`data:image/png;base64,${a}`);
  const B = await loadImg(`data:image/png;base64,${b}`);
  const canvas = document.createElement("canvas");
  canvas.width = A.width + B.width;
  canvas.height = Math.max(A.height, B.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(A, 0, 0);
  ctx.drawImage(B, A.width, 0);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/* ─────────────────────── 6. Generate 클릭 ─────────────────────── */
generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  // 대기 화면: YouTube 프리뷰
  resultBox.innerHTML = YT_IFRAME;
  downloadBtn.setAttribute("disabled", "");
  lastImgUrl = "";

  try {
    const humanB64 = await fileToBase64Compressed(fileInput.files[0]);
    const clothArr = await Promise.all(
      selected.map(id => imgToBase64(CLOTHES.find(c => c.id === id).src))
    );
    const clothB64 = clothArr.length === 2
      ? await mergeTwo(clothArr[0], clothArr[1])
      : clothArr[0];

    const resp = await fetch(`${FN}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_image: humanB64, cloth_image: clothB64 })
    });
    if (!resp.ok) throw new Error(await resp.text());
    const { task_id } = await resp.json();

    poll(task_id, 0);
  } catch (e) {
    alert(e.message);
    resetState();
  }
});

/* ─────────────────────── 7. Poll (3초 간격) ───────────────────── */
async function poll(taskId, attempt) {
  const resp = await fetch(`${FN}/task?id=${taskId}`);
  if (!resp.ok) {
    resetState("Task 조회 실패");
    return;
  }

  const data = await resp.json();
  if (!data.task_status) {
    if (attempt < 40) {
      setTimeout(() => poll(taskId, attempt + 1), 3000);
    } else {
      resetState("결과를 가져오지 못했습니다");
    }
    return;
  }

  if (data.task_status === "succeed") {
    const url = data.image_url
              || data.result_url
              || data.task_result?.images?.[0]?.url;
    if (!url) return resetState("URL 없음");

    lastImgUrl = url;
    resultBox.innerHTML = `<img src="${url}" style="width:100%;border-radius:var(--radius)">`;

// poll 성공 분기에서
if (data.task_status === "succeed") {
  // 이미지 렌더링 코드 …

  downloadBtn.disabled = false;  // ★ 활성화
}

    resetState();
    return;
  }

  if (data.task_status === "failed") {
    resetState("생성 실패");
    return;
  }

  if (attempt < 40) {
    setTimeout(() => poll(taskId, attempt + 1), 3000);
  } else {
    resetState("타임아웃");
  }
}

/* ─────────────────────── 8. 상태 초기화 ───────────────────────── */
function resetState(msg) {
  if(msg) alert(msg);
  generateBtn.disabled = !(fileInput.files[0] && selected.length>0);
  generateBtn.textContent = "Generate Image";
  downloadBtn.disabled = true;   // ★ 다시 비활성화
  lastImgUrl = "";
}

// 다운로드 클릭 핸들러
downloadBtn.addEventListener("click", async () => {
  if (!lastImgUrl) return;
  try {
    const blob = await fetch(lastImgUrl, { mode: "cors" }).then(r => r.blob());
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = urlObj;
    a.download = "ai-fitting-result.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(urlObj);
  } catch (e) {
    alert("다운로드 실패: " + e.message);
  }
});
