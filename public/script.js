/* ────── constants & refs ────── */
const FN   = "/.netlify/functions";
const tabs = document.getElementById("categoryTabs");
const grid = document.getElementById("clothingGrid");
const file = document.getElementById("personPhoto");
const prev = document.getElementById("photoPreview");
const btn  = document.getElementById("generateBtn");
const box  = document.getElementById("resultBox");

let CLOTHES = [], selected = [], cat = "all";

/* ─── 1. load clothes.json ─── */
fetch("/clothes.json")
  .then(r => r.json())
  .then(j => { CLOTHES = j.items || []; renderGrid(); })
  .catch(e => alert("의류 목록 로드 실패: " + e.message));

/* ─── 2. render grid ─── */
function renderGrid() {
  grid.innerHTML = "";
  CLOTHES.filter(c => cat === "all" || c.cat === cat).forEach(c => {
    const d = document.createElement("div");
    d.className = "clothing-item" + (selected.includes(c.id) ? " selected" : "");
    d.dataset.id = c.id;
    d.innerHTML = `<img src="${c.src}"><div class="item-info">${c.name}</div>`;
    grid.appendChild(d);
  });
}

/* ─── 3. category tabs & selection ─── */
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

/* ─── 4. person preview ─── */
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

/* ─── 5. helpers ─── */
// fetch URL→Blob→Base64
const imgToBase64 = u => fetch(u).then(r => r.blob()).then(b =>
  new Promise(res => { const fr=new FileReader(); fr.onloadend=()=>res(fr.result.split(',')[1]); fr.readAsDataURL(b); })
);

// compress & resize person image to ≤ 800px & JPEG 0.7
/**
 * 최대 가로·세로 1270px, 원본 포맷 유지하여 Base64 리턴
 * @param {File} file - input[type=file] 으로 받은 이미지 파일
 * @returns {Promise<string>} - Base64 문자열(“data:…,XXX…” 의 “,” 뒤)
 */
function fileToBase64Compressed(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1270;
      const origW = img.width;
      const origH = img.height;
      // 축소 비율 계산 (1 이하면 축소, 아니면 원본크기)
      const scale = Math.min(1, MAX / Math.max(origW, origH));

      // 캔버스에 그리기
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(origW * scale);
      canvas.height = Math.round(origH * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 원본 MIME 타입 유지 (JPEG/WebP는 품질 파라미터 사용)
      const mimeType = file.type || "image/jpeg";
      const quality  = mimeType === "image/jpeg" ? 0.85 : undefined;

      canvas.toBlob(blob => {
        const fr = new FileReader();
        fr.onloadend = () => {
          // dataURL에서 'base64,' 뒤 부분만 추출
          res(fr.result.split(",")[1]);
        };
        fr.readAsDataURL(blob);
      }, mimeType, quality);
    };
    img.src = URL.createObjectURL(file);
  });
}


// merge two cloth images side by side
const loadImg = src => new Promise(r => { const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>r(i); i.src=src; });
async function mergeTwo(a,b) {
  const A = await loadImg(`data:image/png;base64,${a}`);
  const B = await loadImg(`data:image/png;base64,${b}`);
  const c = document.createElement("canvas");
  c.width = A.width + B.width; c.height = Math.max(A.height, B.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(A, 0, 0); ctx.drawImage(B, A.width, 0);
  return c.toDataURL("image/jpeg", 0.85).split(',')[1];
}

/* ─── 6. Generate 클릭 ─── */
btn.addEventListener("click", async () => {
  btn.disabled = true; btn.textContent = "Generating…";
  try {
    // compress person
    const humanB64 = await fileToBase64Compressed(file.files[0]);

    // cloth images
    const clothImgs = await Promise.all(
      selected.map(id => imgToBase64(CLOTHES.find(c=>c.id===id).src))
    );
    const clothB64 = clothImgs.length === 2
      ? await mergeTwo(clothImgs[0], clothImgs[1])
      : clothImgs[0];

    // send to Netlify Function
    const resp = await fetch(`${FN}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_image: humanB64, cloth_image: clothB64 })
    });
    if (!resp.ok) throw new Error("Generate 함수 에러: " + await resp.text());
    const j = await resp.json();
    poll(j.task_id, 0);

  } catch (err) {
    alert(err.message); reset();
  }
});

/* ─── 7. poll 결과 ─── */
async function poll(id, n) {
  const res = await fetch(`${FN}/task?id=${id}`);
  if (!res.ok) { reset("Task 조회 실패 " + res.status); return; }
  const d = await res.json();
  if (!d.task_status) {
    if (n < 40) { setTimeout(()=>poll(id,n+1),8000); return; }
    reset("결과를 가져오지 못했습니다"); return;
  }
  if (d.task_status === "succeed") {
    // pick whatever URL is present
    const url = d.image_url || d.result_url || d.task_result?.images?.[0]?.url;
    if (!url) { reset("URL을 찾지 못했습니다"); return; }
    box.innerHTML = `<img src="${url}" style="width:100%">`;
    reset(); return;
  }
  if (d.task_status === "failed") { reset("생성 실패"); return; }
  if (n < 40) setTimeout(()=>poll(id,n+1),8000);
  else reset("타임아웃");
}

function reset(msg) {
  if (msg) alert(msg);
  btn.disabled = false; btn.textContent = "Generate Image";
}
