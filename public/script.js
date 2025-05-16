// public/script.js

/* Constants & DOM references */
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
let cat         = "all";
let lastImgUrl  = "";

/* YouTube waiting iframe (autoplay, sound on, no controls, loop) */
const YT_ID     = "GN9zAbqRFKU";
const YT_IFRAME = `
  <iframe
    src="https://www.youtube.com/embed/${YT_ID}?autoplay=1&mute=0&controls=0&loop=1&playlist=${YT_ID}&modestbranding=1&playsinline=1"
    frameborder="0"
    allow="autoplay; encrypted-media"
    style="width:100%;height:100%;border-radius:var(--radius)"
    title="Generating…"
  ></iframe>`;

/* Helpers to show/hide the download button */
function showDownload() {
  downloadBtn.classList.add("show");
  downloadBtn.hidden = false;
}
function hideDownload() {
  downloadBtn.classList.remove("show");
  downloadBtn.hidden = true;
}

/* Initial state */
generateBtn.disabled = true;
hideDownload();

/* 1. Load clothes.json */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => {
    CLOTHES = j.items || [];
    renderGrid();
  })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* 2. Render clothing grid */
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

/* 3. Tab switching & selection */
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
    if (selected.length === 2) { alert("의류는 최대 2개 선택 가능합니다."); return; }
    selected.push(id);
  }
  renderGrid();
  updateGenerateButton();
});

/* 4. Person photo preview */
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    const fr = new FileReader();
    fr.onload = e => previewBox.innerHTML = `<img src="${e.target.result}" style="width:100%">`;
    fr.readAsDataURL(file);
  }
  updateGenerateButton();
});

/* Enable/disable Generate button */
function updateGenerateButton() {
  generateBtn.disabled = !(fileInput.files[0] && selected.length > 0);
}

/* 5. Utility: URL → Base64 */
const imgToBase64 = url =>
  fetch(url)
    .then(r => r.blob())
    .then(b => new Promise(res => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result.split(",")[1]);
      fr.readAsDataURL(b);
    }));

/* Compress & resize to max 1270px, keep original format */
function fileToBase64Compressed(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = file.type || "image/jpeg";
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

/* Merge two cloth images side by side */
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

/* 6. Generate click handler */
generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  // Show waiting video
  resultBox.innerHTML = YT_IFRAME;
  hideDownload();
  lastImgUrl = "";

  try {
    // Prepare images
    const humanB64 = await fileToBase64Compressed(fileInput.files[0]);
    const clothB64s = await Promise.all(
      selected.map(id => imgToBase64(CLOTHES.find(c => c.id === id).src))
    );
    const clothB64 = clothB64s.length === 2
      ? await mergeTwo(clothB64s[0], clothB64s[1])
      : clothB64s[0];

    // Call generate function
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

/* 7. Poll for result (every 3 seconds) */
async function poll(taskId, attempt) {
  const resp = await fetch(`${FN}/task?id=${taskId}`);
  if (!resp.ok) { resetState("Task 조회 실패"); return; }

  const data = await resp.json();
  if (!data.task_status) {
    if (attempt < 40) {
      return setTimeout(() => poll(taskId, attempt + 1), 3000);
    } else {
      return resetState("결과를 가져오지 못했습니다");
    }
  }

  if (data.task_status === "succeed") {
    const url = data.image_url || data.result_url || data.task_result?.images?.[0]?.url;
    if (!url) return resetState("URL 없음");

    lastImgUrl = url;
    // Only replace image/iframe inside resultBox
    resultBox.innerHTML = `<img src="${url}" style="width:100%;border-radius:var(--radius)">`;
    // Show download button below
    downloadBtn.href = url;
    showDownload();

    resetState();
    return;
  }

  if (data.task_status === "failed") {
    return resetState("생성 실패");
  }

  if (attempt < 40) {
    setTimeout(() => poll(taskId, attempt + 1), 3000);
  } else {
    resetState("타임아웃");
  }
}

/* 8. Reset state after each cycle */
function resetState(msg) {
  if (msg) alert(msg);
  generateBtn.disabled = !(fileInput.files[0] && selected.length);
  generateBtn.textContent = "Generate Image";
  hideDownload();
  lastImgUrl = "";
}

/* 9. Download button logic */
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
