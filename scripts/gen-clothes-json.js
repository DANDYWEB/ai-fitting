// scripts/gen-clothes-json.js
const fs = require("fs");
const path = require("path");
const CATS = ["top", "pants", "dress"];
const IMG  = /\.(png|jpe?g|webp)$/i;

const base = path.join(__dirname, "../public/clothes");
let id=1, list=[];

CATS.forEach(cat=>{
  const dir = path.join(base, cat);
  if(!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f=>IMG.test(f)).forEach(f=>{
    list.push({
      id:id++, cat,
      src:`/clothes/${cat}/${f}`,
      name:f.replace(/\.[^.]+$/,"").replace(/[_-]/g," ")
    });
  });
});

fs.writeFileSync(
  path.join(__dirname, "../public/clothes.json"),
  JSON.stringify({items:list}, null, 2)
);
console.log(`✔ clothes.json generated with ${list.length} items`);
