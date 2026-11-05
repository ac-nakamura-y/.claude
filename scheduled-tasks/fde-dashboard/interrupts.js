// 差し込みタスクを src.html のメンバーに入れる。渡したファイルが全員分の正（書いていないメンバーは差し込みなし）。
// Usage: node interrupts.js <interrupts.json>
//   interrupts.json: {memberId: [{"t": "タスク名", "note": "状況（1〜2 文）"}]}
const fs = require("fs"), path = require("path");
const P = path.join(__dirname, "src.html");
let s = fs.readFileSync(P, "utf8");
const IN = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
const i = s.indexOf("const DATA=["), j = s.indexOf("\n];\n", i) + 4;
if (i < 0 || j < 4) throw new Error("DATA が見つからない");
const DATA = new Function(s.slice(i, j) + ";return DATA;")();
const ids = new Set(DATA.map(m => m.id));
for (const [id, list] of Object.entries(IN)) {
  if (!ids.has(id)) throw new Error("不明なメンバー " + id);
  if (!Array.isArray(list) || !list.length) throw new Error(id + ": 差し込みタスクが空");
  for (const x of list) if (Object.keys(x).join() !== "t,note" || typeof x.t !== "string" || !x.t || typeof x.note !== "string") throw new Error(id + ": 形が不正 " + JSON.stringify(x));
}
const J = v => JSON.stringify(v);
for (const m of DATA) { if (IN[m.id]) m.interrupts = IN[m.id]; else delete m.interrupts; }
s = s.slice(0, i) + "const DATA=[\n" + DATA.map(x => {
  const head = Object.entries(x).filter(([k]) => !["goals", "ws"].includes(k)).map(([k, v]) => k + ":" + J(v)).join(",");
  return "{" + head + ",\n goals:[\n  " + x.goals.map(J).join(",\n  ") + "],\n ws:[\n  " + x.ws.map(J).join(",\n  ") + "]}";
}).join(",\n") + "\n];\n" + s.slice(j);
fs.writeFileSync(P, s);
console.log(DATA.filter(m => m.interrupts).map(m => m.id + ": " + m.interrupts.map(x => x.t).join(" / ")).join("\n") || "差し込みタスクなし");
