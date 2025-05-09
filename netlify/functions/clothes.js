/* 서버리스: /clothes ─ 폴더 스캔 → 목록 JSON */
const fs   = require("fs");
const path = require("path");
const CATS = ["top", "pants", "dress"];
const IMG  = /\.(png|jpe?g|webp)$/i;

exports.handler = async () => {
  const base = path.join(__dirname, "../../public/clothes");
  let id = 1, list = [];

  CATS.forEach(cat => {
    const dir = path.join(base, cat);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => IMG.test(f)).forEach(f => {
      list.push({
        id  : id++,
        cat : cat,
        src : `/clothes/${cat}/${f}`,
        name: f.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")
      });
    });
  });

  return {
    statusCode: 200,
    headers   : { "Content-Type": "application/json" },
    body      : JSON.stringify({ items: list })
  };
};
