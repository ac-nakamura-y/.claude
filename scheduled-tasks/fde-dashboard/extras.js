// src.html のデータに、Linear の期限の Issue と Do³ の迷い・判断の原文を入れる。渡したファイルがその項目の全員分・全件の正。
// Usage:
//   node extras.js due <due.json>        {projectKey: [[id, title, "YYYY-MM-DD", 姓|null, status], ...]}（完了していないプロジェクト全部。担当はメンバーの id で持つ）
//   node extras.js doubts <doubts.json>  {memberId: {"d": "M/D", "text": "原文"} | null}（メンバー全員）
const fs = require("fs"), path = require("path");
const [kind, file] = process.argv.slice(2);
const P = path.join(__dirname, "src.html");
let s = fs.readFileSync(P, "utf8");
const IN = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const grab = (start, end) => { const i = s.indexOf(start), j = s.indexOf(end, i); if (i < 0 || j < 0) throw new Error("block not found " + start); return [i, j + end.length]; };
const J = v => JSON.stringify(v);
const WHO = { "渡邉": "watanabe", "孫": "son", "野田": "noda", "向笠": "mukasa", "榎本": "enomoto", "松本": "matsumoto", "中村": "nakamura" };
if (kind === "due") {
  const [i, j] = grab("const PROJECTS=[", "\n];\n");
  const PROJECTS = new Function(s.slice(i, j) + ";return PROJECTS;")();
  for (const p of PROJECTS) {
    if (p.state === "completed") { delete p.due; continue; }
    const rows = IN[p.key]; if (!Array.isArray(rows)) throw new Error("期限の Issue がない " + p.key);
    for (const r of rows) if (r.length !== 5 || !/^\d{4}-\d{2}-\d{2}$/.test(r[2]) || (r[3] !== null && !WHO[r[3]])) throw new Error(p.key + ": 形が不正 " + J(r));
    p.due = rows.map(([id, t, d, who, st]) => [id, t, d, who && WHO[who], st]);
  }
  s = s.slice(0, i) + "const PROJECTS=[\n  " + PROJECTS.map(J).join(",\n  ") + "\n];\n" + s.slice(j);
  console.log(PROJECTS.filter(p => p.due && p.due.length).map(p => p.key + ": " + p.due.length).join("\n") || "期限の Issue なし");
} else if (kind === "doubts") {
  const [i, j] = grab("const DATA=[", "\n];\n");
  const DATA = new Function(s.slice(i, j) + ";return DATA;")();
  for (const m of DATA) {
    if (!(m.id in IN)) throw new Error("迷い・判断のデータがない " + m.id);
    const x = IN[m.id];
    if (x === null) { delete m.doubt; continue; }
    if (Object.keys(x).join() !== "d,text" || !/^\d{1,2}\/\d{1,2}$/.test(x.d) || typeof x.text !== "string" || !x.text.trim()) throw new Error(m.id + ": 形が不正 " + J(x));
    m.doubt = { d: x.d, text: x.text.trim() };
  }
  s = s.slice(0, i) + "const DATA=[\n" + DATA.map(x => {
    const head = Object.entries(x).filter(([k]) => !["goals", "ws"].includes(k)).map(([k, v]) => k + ":" + J(v)).join(",");
    return "{" + head + ",\n goals:[\n  " + x.goals.map(J).join(",\n  ") + "],\n ws:[\n  " + x.ws.map(J).join(",\n  ") + "]}";
  }).join(",\n") + "\n];\n" + s.slice(j);
  console.log(DATA.map(m => m.id + ": " + (m.doubt ? m.doubt.d + " " + m.doubt.text.length + "字" : "なし")).join("\n"));
} else throw new Error("due か doubts を指定する");
fs.writeFileSync(P, s);
