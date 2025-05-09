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
function fileToBase64Compressed(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(blob => {
        const fr = new FileReader();
        fr.onloadend = () => {
          // fr.result = "data:image/jpeg;base64,XXX..."
          res(fr.result.split(',')[1]);
        };
        fr.readAsDataURL(blob);
      }, "image/jpeg", 0.7);
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
