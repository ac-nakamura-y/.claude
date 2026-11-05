// Linear と Do³ の最新を src.html のデータに入れる。ページのコードは rebuild.js が作り直す。
// Usage: node refresh.js <asOf YYYY-MM-DD> <linearDir> <do3.json>
//   linearDir は collect.py の出力（projects.json・issues.json・issues_472.json・cycle.txt）
//   月が替わったら、当月の営業日（DAYS）と週次の日（WEEKLY）を days.js の暦で作り直し、Do³ の記録を空から始める
//   projects.json: {key: {uuid, url, sortOrder, name, state, start, target, lead, members, ms:[[name, date|null, pct]]}}（Initiative の全プロジェクト。sortOrder は Linear の手動の並び順）
//   issues.json:   {key: [[status, estimate|null, 姓|null, milestone|null], ...]}（完了していないプロジェクト。472 は別ファイル）
//   do3.json:      {from: "M/D", daily: {memberId: "FTN..."}, weekly: {"M/D": {memberId: "F|T|N"}}}
const fs = require("fs"), path = require("path"), days = require("./days");
const [asOf, linDir, do3File] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || "")) throw new Error("asOf を YYYY-MM-DD で渡す");
const [projFile, issFile, iss472File] = ["projects.json", "issues.json", "issues_472.json"].map(f => path.join(linDir, f));
const CYCLE = +fs.readFileSync(path.join(linDir, "cycle.txt"), "utf8"); if (!Number.isInteger(CYCLE)) throw new Error("cycle.txt が不正");
const P = path.join(__dirname, "src.html");
let s = fs.readFileSync(P, "utf8");
const read = f => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
const LIN = read(projFile), ISS = read(issFile), DO3 = read(do3File);
ISS["P-MRTTOPS-472"] = read(iss472File);

const grab = (start, end) => { const i = s.indexOf(start), j = s.indexOf(end, i); if (i < 0 || j < 0) throw new Error("block not found " + start); return [i, j + end.length]; };
const evalBlock = (name, start, end) => { const [i, j] = grab(start, end); return new Function(s.slice(i, j) + ";return " + name + ";")(); };
const PROJECTS = evalBlock("PROJECTS", "const PROJECTS=[", "\n];\n");
const DATA = evalBlock("DATA", "const DATA=[", "\n];\n");
let DAYS = evalBlock("DAYS", "const DAYS=[", "\n");
let WEEKLY = evalBlock("WEEKLY", "const WEEKLY=[", "\n");

const STATUSES = ["Done", "In Customer", "In Review", "In Progress", "pending", "Todo", "Backlog", "Triage"];
const EXCLUDED = new Set(["Canceled", "Duplicate"]);
const STATES = new Set(["started", "planned", "backlog", "completed"]);
const WHO = { "渡邉": "watanabe", "孫": "son", "野田": "noda", "向笠": "mukasa", "榎本": "enomoto", "松本": "matsumoto", "中村": "nakamura" };
const FULL = { "渡邉駿介": "watanabe", "孫政": "son", "野田えりか": "noda", "向笠愛美": "mukasa", "榎本巧": "enomoto", "松本直": "matsumoto", "中村勇士": "nakamura" };
const log = [];
const J = v => JSON.stringify(v);

// ---- プロジェクト：名前・状態・期間・担当・マイルストーン・Issue を Linear にそろえる
// プロジェクトは UUID で突き合わせる。チームを移ると key（P-<チーム>-<番号>）が変わるため
const known = new Map(PROJECTS.map(p => [p.id, p]));
const linIds = new Set(Object.values(LIN).map(l => l.uuid));
for (const p of PROJECTS) if (!linIds.has(p.id)) throw new Error("Initiative から外れたプロジェクト " + p.key + "（扱いを決めてから進める）");
const next = [];
for (const [key, l] of Object.entries(LIN)) {
  if (l.state === "canceled") { if (known.has(l.uuid)) log.push("取り消し " + key + " " + l.name); continue; }
  if (!STATES.has(l.state)) throw new Error(key + ": 想定外の状態 " + l.state);
  let p = known.get(l.uuid);
  if (!p) { p = { id: l.uuid, key }; log.push("新規 " + key + " " + l.name); }
  if (p.key !== key) {
    log.push("key " + p.key + " → " + key + " " + l.name);
    for (const m of DATA) m.week = m.week.map(k => k === p.key ? key : k);
    p.key = key;
  }
  if (!/^https:\/\/linear\.app\/active-core-swat\/project\//.test(l.url || "")) throw new Error(key + ": プロジェクトの URL が不正 " + l.url);
  if (typeof l.sortOrder !== "number") throw new Error(key + ": 並び順（sortOrder）がない");
  const owners = [...new Set([l.lead, ...l.members].filter(n => n && FULL[n]).map(n => FULL[n]))];
  if (!owners.length) log.push("FDE の担当なし " + key + " " + l.name);
  for (const [f, v] of [["name", l.name], ["state", l.state], ["start", l.start], ["target", l.target]]) if (p[f] !== undefined && p[f] !== v) log.push(key + " " + f + ": " + p[f] + " → " + v);
  if (p.owners && p.owners.join() !== owners.join()) log.push(key + " 担当: " + p.owners.join("・") + " → " + owners.join("・"));
  Object.assign(p, { name: l.name, url: l.url, owners, state: l.state, start: l.start, target: l.target });
  if (l.state === "completed") { Object.assign(p, { ms: [], iss: [], unest: 0 }); next.push(p); continue; }
  const ms = l.ms.map((x, i) => ({ x, i })).sort((a, b) => (a.x[1] || "9999").localeCompare(b.x[1] || "9999") || a.i - b.i).map(o => o.x);
  ms.forEach(m => { if (m.length !== 3 || typeof m[2] !== "number" || m[2] < 0 || m[2] > 100) throw new Error(key + ": マイルストーンの形が不正 " + JSON.stringify(m)); });
  const rows = ISS[key]; if (!rows) throw new Error("Issue がない " + key);
  const agg = new Map(); let unest = 0;
  for (const [st, est, who, msName] of rows) {
    if (EXCLUDED.has(st)) continue;
    const si = STATUSES.indexOf(st); if (si < 0) throw new Error(key + ": 不明な Issue 状態 " + st);
    const mi = msName === null ? -1 : ms.findIndex(x => x[0] === msName); if (mi < 0 && msName !== null) throw new Error(key + ": 不明なマイルストーン " + msName);
    if (who !== null && !WHO[who]) throw new Error("不明な担当 " + who);
    if (est === null) unest++;
    const g = [si, who === null ? null : WHO[who], mi].join("|"); agg.set(g, (agg.get(g) || 0) + (est === null ? 1 : est));
  }
  Object.assign(p, { ms, iss: [...agg].map(([g, pts]) => { const [si, mid, mi] = g.split("|"); return [+si, pts, mid === "" ? null : mid, +mi]; }), unest });
  next.push(p);
}
next.sort((a, b) => LIN[a.key].sortOrder - LIN[b.key].sortOrder); // Linear と同じ並び順

// ---- 暦：月が替わったら DAYS・WEEKLY を作り直して Do³ を空から始める。同じ月なら暦と一致することを確かめる
const CAL = days.month(asOf);
if (DAYS[0].split("/")[0] !== CAL.days[0].split("/")[0]) {
  log.push("月が替わった：Do³ の記録を " + CAL.days[0] + " から始める");
  DAYS = CAL.days; WEEKLY = CAL.weekly; for (const m of DATA) { m.cov = ""; m.wk = ""; }
} else if (J(DAYS) !== J(CAL.days) || J(WEEKLY) !== J(CAL.weekly)) throw new Error("DAYS・WEEKLY が days.js の暦と合わない");
if (!DAYS.includes(+asOf.slice(5, 7) + "/" + +asOf.slice(8))) throw new Error(asOf + " は営業日でない");

// ---- メンバー：今週のプロジェクトはカードにあるものだけ残す。Do³ を当月の続きとして入れる
const fromIdx = DAYS.indexOf(DO3.from); if (fromIdx < 0) throw new Error("Do³ の開始日が当月の営業日にない " + DO3.from);
for (const m of DATA) {
  const cardKeys = next.filter(p => p.state !== "completed" && p.owners.includes(m.id)).map(p => p.key);
  const drop = m.week.filter(k => !cardKeys.includes(k)); if (drop.length) { log.push(m.name + " 今週から外す（完了など）: " + drop.join(" ")); m.week = m.week.filter(k => cardKeys.includes(k)); }
  const d = DO3.daily[m.id]; if (!/^[FTN]+$/.test(d || "")) throw new Error(m.id + ": Do³ 日次がない");
  if (fromIdx > m.cov.length) throw new Error(m.id + ": Do³ に抜けがある");
  m.cov = m.cov.slice(0, fromIdx) + d;
  if (m.cov.length > DAYS.length) throw new Error(m.id + ": Do³ が当月の営業日より長い");
  for (const [day, byId] of Object.entries(DO3.weekly)) {
    const wi = WEEKLY.indexOf(day); if (wi < 0) throw new Error("週次の日付が不正 " + day);
    const c = byId[m.id]; if (!/^[FTN]$/.test(c || "")) throw new Error(m.id + ": 週次がない " + day);
    if (wi > m.wk.length) throw new Error(m.id + ": 週次に抜けがある");
    m.wk = m.wk.slice(0, wi) + c + m.wk.slice(wi + 1);
  }
}

// ---- 書き戻す（形は rebuild.js が整える）
let [pi, pj] = grab("const PROJECTS=[", "\n];\n");
s = s.slice(0, pi) + "const PROJECTS=[\n  " + next.map(J).join(",\n  ") + "\n];\n" + s.slice(pj);
let [di, dj] = grab("const DATA=[", "\n];\n");
s = s.slice(0, di) + "const DATA=[\n" + DATA.map(x => {
  const head = Object.entries(x).filter(([k]) => !["goals", "ws"].includes(k)).map(([k, v]) => k + ":" + J(v)).join(",");
  return "{" + head + ",\n goals:[\n  " + x.goals.map(J).join(",\n  ") + "],\n ws:[\n  " + x.ws.map(J).join(",\n  ") + "]}";
}).join(",\n") + "\n];\n" + s.slice(dj);
const [ai, aj] = grab("const LINEAR_PROJECTS_AS_OF=", "\n");
s = s.slice(0, ai) + 'const LINEAR_PROJECTS_AS_OF="' + asOf + '"; // Linear から取得した日。本日の線と期限の判定に使う\n' + s.slice(aj);
const [ci, cj] = grab("const CYCLE=", "\n");
s = s.slice(0, ci) + "const CYCLE=" + CYCLE + "; // Linear（marutto-ops）の今週の Cycle 番号\n" + s.slice(cj);
const [ki, kj] = grab("const DAYS=[", "\n");
s = s.slice(0, ki) + "const DAYS=" + J(DAYS) + "; // 当月の営業日" + (CAL.off.length ? "（" + CAL.off.join("・") + " は祝日）" : "") + "\n" + s.slice(kj);
const [wi, wj] = grab("const WEEKLY=[", "\n");
s = s.slice(0, wi) + "const WEEKLY=" + J(WEEKLY) + ";\n" + s.slice(wj);
fs.writeFileSync(P, s);
console.log(log.join("\n") || "変更の記録なし");
console.log("projects", next.length, "active", next.filter(p => p.state !== "completed").length, "| Do³", DATA.map(m => m.id + ":" + m.cov + "/" + m.wk).join(" "));
