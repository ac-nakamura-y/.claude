// src.html のデータはそのままに、ページのコード（見た目・計算・表示）をすべて作り直す。
// Usage: node rebuild.js <src.html>
const fs = require("fs");
const P = process.argv[2];
const s = fs.readFileSync(P, "utf8");

const grab = (start, end) => { const i = s.indexOf(start); if (i < 0) throw new Error("not found " + start); const j = s.indexOf(end, i); if (j < 0) throw new Error("end not found " + end); return s.slice(i, j + end.length); };
const line = start => grab(start, "\n");
const evalBlock = (name, start, end) => new Function(grab(start, end) + ";return " + name + ";")();

const DAYS_LINE = line("const DAYS=[");
const WEEKLY_LINE = line("const WEEKLY=[");
const ST_LINE = line("const ST={");
const MISSION_BLOCK = grab("const MISSION={", "\n};\n");
const MARK_LINE = line("const MARK={");
const ASOF_LINE = line("const LINEAR_PROJECTS_AS_OF=");
const ASOF = (ASOF_LINE.match(/"(\d{4}-\d{2}-\d{2})"/) || [])[1];
if (!ASOF) throw new Error("LINEAR_PROJECTS_AS_OF が読めない");
const CYCLE_LINE = line("const CYCLE=");
const CYCLE = (CYCLE_LINE.match(/^const CYCLE=(\d+);/) || [])[1];
if (!CYCLE) throw new Error("CYCLE が読めない");
const PROJECTS = evalBlock("PROJECTS", "const PROJECTS=[", "\n];\n");
const DATA = evalBlock("DATA", "const DATA=[", "\n];\n");

// 詳細パネルだけが読んでいたデータを外す
for (const p of PROJECTS) {
  for (const k of ["done", "notion", "health"]) delete p[k];
  if (!/^https:\/\/linear\.app\/active-core-swat\/project\//.test(p.url || "")) throw new Error(p.key + ": Linear の URL がない（refresh.js で取り込む）");
  for (const m of p.ms) if (m.length !== 3 || typeof m[2] !== "number") throw new Error(p.key + ": マイルストーンの形が不正 " + JSON.stringify(m));
}
for (const m of DATA) {
  delete m.role; delete m.src;
  m.goals = m.goals.map(g => ({ t: g.t, m: g.m }));
  m.ws = m.ws.map(w => { const o = { p: w.p }; if (w.task !== undefined) o.task = w.task; o.st = w.st; o.link = w.link; return o; });
}
// 孫さん（育休から復帰）を渡邉さんの次に加える。Linear では [FDE] 制作プロセス改善のメンバー。
// 10/20 に取得した Issue では孫さんの担当分が「担当なし」に入っていたので、本人の分に移す：[状態, pt, マイルストーン]（取り消し・重複を除く）
if (!DATA.some(m => m.id === "son")) {
  const at = DATA.findIndex(m => m.id === "watanabe") + 1;
  if (at < 1) throw new Error("watanabe not found");
  DATA.splice(at, 0, { id: "son", name: "孫政", cov: "N".repeat(DATA[0].cov.length), week: [], wk: "N".repeat(DATA[0].wk.length), goals: [], ws: [] });
  const p472 = PROJECTS.find(x => x.key === "P-MRTTOPS-472");
  p472.owners.push("son");
  for (const [si, pts, mi] of [[0, 87, -1], [0, 3, 0], [2, 2, -1], [6, 6, -1]]) {
    const b = p472.iss.find(x => x[0] === si && x[2] === null && x[3] === mi);
    if (!b || b[1] < pts) throw new Error("担当なしの分が足りない " + si + "/" + mi);
    b[1] -= pts;
    p472.iss.push([si, pts, "son", mi]);
  }
  p472.iss = p472.iss.filter(x => x[1] > 0);
}
const J = v => JSON.stringify(v);
const projOut = "const PROJECTS=[\n  " + PROJECTS.map(J).join(",\n  ") + "\n];\n";
const dataOut = "const DATA=[\n" + DATA.map(x => {
  const head = Object.entries(x).filter(([k]) => !["goals", "ws"].includes(k)).map(([k, v]) => k + ":" + J(v)).join(",");
  return "{" + head + ",\n goals:[\n  " + x.goals.map(J).join(",\n  ") + "],\n ws:[\n  " + x.ws.map(J).join(",\n  ") + "]}";
}).join(",\n") + "\n];\n";

const POLICY = "上期方針：阪急交通社・トリプルエス・SABON の全工程を AG で完結し、業務委託コストを 12 月までに ▲100 万円/月";
if (!s.includes(POLICY)) throw new Error("policy text changed");
// 週の表示：取り込んだ日の週の月曜と、その週の Cycle 番号
const MONDAY = (([y, m, d]) => { const t = new Date(y, m - 1, d); t.setDate(d - (t.getDay() + 6) % 7); return (t.getMonth() + 1) + "/" + t.getDate(); })(ASOF.split("-").map(Number));
const WEEK_LABEL = MONDAY + " 週（Cycle " + CYCLE + "）";

const css = String.raw`
<title>FDE プランニング・デイリー_${ASOF}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Zen+Maru+Gothic:wght@500;700;900&display=swap">
<style>
/* 掲示板のような 1 枚。クリーム色の方眼の上に、黒い太枠と右下にずらした影の白いカードを、余白を広く取って並べる。見出しは色のついたシール、数字と日付は等幅。日付と週は右上。
   全メンバー：本人ごとに全体進捗（カードはすべて同じ大きさ）。メンバーごと：本人の欄、差し込みタスク、迷い・判断、担当プロジェクトのカード（次のマイルストーン・バー・本人の本日期限・期限超過の Issue）。
   プロジェクト名は Linear のプロジェクトへ、本日期限・期限超過の Issue は Linear の Issue へのリンク。
   幅 1600 で組んで画面の幅に合わせて縮め、縦は中身の高さのままスクロールする。上から、タイトルと週・日付 → まとめ（ミッションとのつながり・Do³ の実施記録）→ 表示の切り替え → 全メンバー（サンプル・中村・ほかの 6 人、4×2）かメンバーごと。
   文字の大きさは 4 段だけ使う：タイトル（--fs-title）、見出し（--fs-head）、本文（--fs-body）、注記（--fs-small） */
:root{
  --bg:#f6f2ea; --grid:#d9d2c4; --surface:#ffffff; --surface-2:#f3efe6; --ink:#141414; --fg:#1f1f1f; --muted:#6a6a66; --line:#141414;
  --blue:#5aaefc; --blue-soft:#b7dcff; --green:#4cc38a; --green-soft:#c5efd6; --green-deep:#23955a; --green-pale:#e3f6ea; --yellow:#ffe566; --amber:#f0b429; --orange:#ff9f4d; --pink:#ffc5c0; --red:#f25c5c;
  --gray:#e8e3d8; --gray-strong:#a8a39a;
  --accent:var(--blue);
  --s-run:var(--blue); --s-wait:var(--orange); --s-check:var(--gray-strong);
  --heat-full:var(--green-deep); --heat-thread:var(--green-pale); --heat-none:var(--gray);
  --is-done:var(--blue); --is-cust:var(--blue-soft); --is-rev:var(--green); --is-prog:var(--amber);
  --today:#e23b3b; --ms:#ffffff; --ms-late:#e23b3b;
  --fs-title:36px; --fs-head:17px; --fs-body:13.5px; --fs-small:11px;
  --font:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  --shadow:4px 4px 0 var(--ink);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{overflow-x:hidden}
body{margin:0;background-color:var(--bg);background-image:radial-gradient(var(--grid) 1.1px,transparent 1.3px);background-size:18px 18px;color:var(--fg);font-family:var(--font);font-size:var(--fs-body);line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0}
button{font:inherit;color:inherit}
sup{font-size:.65em;line-height:0}
:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.stage{position:relative;width:100%;overflow:hidden}
.app{position:absolute;left:0;top:0;width:1600px;transform:scale(var(--s,1));transform-origin:0 0;display:grid;gap:16px;padding:22px 30px 34px}
/* シール：黒枠に色を塗った小さな見出し */
.sticker{display:inline-block;padding:1px 10px;border:2px solid var(--ink);border-radius:4px;background:var(--yellow);color:var(--ink);font-weight:700;line-height:20px;white-space:nowrap;box-shadow:2px 2px 0 var(--ink)}
.sticker.b{background:var(--blue-soft)}.sticker.g{background:var(--green-soft)}.sticker.r{background:var(--red);color:#ffffff}.sticker.w{background:var(--surface)}
.box{background:var(--surface);border:2px solid var(--ink);border-radius:6px;box-shadow:var(--shadow)}
header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:14px;border-bottom:3px solid var(--ink)}
h1{font-size:var(--fs-title);font-weight:900;letter-spacing:.01em;line-height:44px}
.sub{display:flex;align-items:center;margin:0;font-family:var(--mono);font-size:var(--fs-head);font-weight:700;line-height:26px;color:var(--ink)}
.sub span+span{margin-left:16px;padding-left:16px;border-left:2px solid var(--ink)}
.summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px}
.panel{padding:14px 18px 16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.panel h2{display:flex;align-items:center;gap:12px;font-size:var(--fs-head);font-weight:700;line-height:24px;white-space:nowrap}
.panel .note{margin-top:-4px;font-size:var(--fs-small);line-height:14px;color:var(--muted)}
.key{display:flex;align-items:center;gap:10px;margin-left:auto;font-size:var(--fs-small);font-weight:500;color:var(--muted)}
.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.mx{display:grid;width:100%}
.mx-row{display:grid;grid-template-columns:48px repeat(4,minmax(0,1fr));gap:12px;align-items:center;height:22px}
.mx-head{height:20px;font-size:var(--fs-small);font-weight:700;color:var(--muted)}
.mx-h{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help}
.mx-h b{color:var(--ink);margin-right:3px}
.mx-name{font-weight:700}
.mx-cell{display:flex;gap:5px;align-items:center;height:22px;border-left:2px solid var(--gray);padding-left:10px}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;flex:none;background:currentColor;border:2px solid var(--ink);cursor:help}
.dot.run{color:var(--s-run)}.dot.wait{color:var(--s-wait)}.dot.check{color:var(--s-check)}
.dot.out{background:var(--surface)}
.key .dot{width:10px;height:10px;margin-right:4px;cursor:default}
#heat svg{display:block}
svg text{font-family:var(--font);fill:var(--muted);font-size:var(--fs-small);font-weight:500}
svg text.mono{font-family:var(--mono)}
.cell:focus{outline:none}
.cell:focus rect,.cell:hover rect,.cell:focus circle,.cell:hover circle{stroke:var(--ink);stroke-width:2}
.tabsbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.view-tabs{display:inline-flex;gap:10px}
.view-tabs button{border:2px solid var(--ink);background:var(--surface);border-radius:5px;padding:3px 16px;font-size:var(--fs-body);font-weight:700;color:var(--ink);cursor:pointer;box-shadow:3px 3px 0 var(--ink)}
.view-tabs button[aria-selected="true"]{background:var(--yellow);transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}
.isw{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 4px 0 0}
.isw.is5{box-shadow:inset 0 0 0 1px var(--gray-strong)}
.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:1fr;gap:20px}
.card{padding:22px 24px 24px;display:flex;flex-direction:column;min-width:0;min-height:0}
.card-head{display:flex;align-items:center;gap:6px;height:26px;margin-bottom:18px}
.card-head .st{font-size:var(--fs-head);line-height:26px;width:18px}
.card-head h3{font-size:var(--fs-head);font-weight:900;line-height:26px}
.pcap{display:grid;gap:6px;margin:0 0 30px 24px}
.pcap-h{position:relative;height:18px;font-weight:700;line-height:18px}
.axis{display:flex;justify-content:space-between;font-family:var(--mono);font-size:var(--fs-small);line-height:13px;color:var(--muted)}
.callout{margin:0 0 30px 24px;padding:22px 18px 18px;border:2px solid var(--ink);border-radius:6px;background:var(--pink);box-shadow:2px 2px 0 var(--ink);display:grid;gap:8px;align-content:start;position:relative}
.callout-h{position:absolute;top:-12px;left:10px;padding:0 8px;border:2px solid var(--ink);border-radius:4px;background:var(--red);color:#ffffff;font-size:var(--fs-small);font-weight:700;line-height:18px}
.callout ul{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.warn{margin:0 0 6px 24px;padding:22px 18px 18px;border:2px solid var(--ink);border-radius:6px;background:#fff3bf;box-shadow:2px 2px 0 var(--ink);position:relative}
.warn-h{position:absolute;top:-12px;left:10px;padding:0 8px;border:2px solid var(--ink);border-radius:4px;background:var(--yellow);color:var(--ink);font-size:var(--fs-small);font-weight:700;line-height:18px}
.warn-h em{font-style:normal;font-family:var(--mono);margin-left:6px}
.warn p{margin:0;font-size:var(--fs-small);line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.none{margin:0;font-size:var(--fs-small);color:var(--muted)}
.callout.empty,.warn.empty{background:var(--surface)}
.callout b{display:block;font-weight:700;line-height:20px;color:var(--ink)}
.callout span{display:block;margin-top:2px;font-size:var(--fs-small);line-height:18px;color:#5a4a48}
.more-h{display:flex;align-items:center;gap:6px;width:100%;margin:0;padding:0;border:0;background:none;cursor:pointer;font-size:var(--fs-small);font-weight:700;color:var(--ink);line-height:18px;text-align:left}
.more-h::before{content:"";flex:none;width:16px;height:16px;border:2px solid var(--ink);border-radius:3px;background:var(--surface) no-repeat center/8px 8px;box-shadow:1.5px 1.5px 0 var(--ink);background-image:linear-gradient(var(--ink),var(--ink)),linear-gradient(var(--ink),var(--ink));background-size:8px 2px,2px 8px}
.more-h::after{content:"";flex:1;height:2px;margin-left:6px;background:var(--ink);opacity:.25}
.more.open .more-h::before{background-size:8px 2px,0 0}
.more-list{visibility:hidden}
.more.open .more-list{visibility:visible}
.st{font-size:14px;line-height:18px;width:18px;text-align:center;cursor:help}
.pbar{position:relative;display:block;height:12px;min-width:0}
.pbar .trk{position:absolute;left:0;right:0;top:0;height:12px;border:2px solid var(--ink);border-radius:3px;background:var(--surface);display:flex;overflow:hidden}
.pbar .trk i{display:block;height:100%;flex:none}
.pbar .ms{position:absolute;top:0;width:12px;height:12px;margin-left:-6px;cursor:help}
.pbar .ms::after{content:"";position:absolute;left:3px;top:3px;width:6px;height:6px;border-radius:50%;background:var(--ms);box-shadow:0 0 0 1.5px var(--ink)}
.pbar .ms.late::after{background:var(--ms-late)}
.pbar .today{position:absolute;top:-4px;height:20px;width:3px;margin-left:-1.5px;border-radius:1px;background:var(--today);box-shadow:0 0 0 1px var(--surface)}
.is0{background:var(--is-done)}.is1{background:var(--is-cust)}.is2{background:var(--is-rev)}.is3{background:var(--is-prog)}
.is4,.is5,.is6,.is7{background:var(--gray)}
.mview{display:grid;gap:16px}
.mhead{display:grid;grid-template-columns:560px minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:stretch}
.mhead .card{min-height:0}
.mhead .pcap{margin-bottom:0}
.mnote{display:flex;flex-direction:column}
.mnote .callout,.mnote .warn{margin:0;flex:1}
.pgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-content:start}
.pcard{padding:20px 22px 22px;display:flex;flex-direction:column;gap:8px;min-width:0}
.due{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:8px;font-size:var(--fs-small);line-height:18px}
.due li{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;align-items:center}
.due .tag{padding:0 5px;border:1.5px solid var(--ink);border-radius:3px;font-weight:700;line-height:15px}
.due .over .tag{background:var(--red);color:#ffffff}
.due .today .tag{background:var(--yellow)}
.due .mono{font-weight:700}
.due .dn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.due .rest{display:block;color:var(--muted);font-weight:700;cursor:help}
.pcard .ph{display:flex;gap:6px;align-items:flex-start}
.pcard .ph .st{flex:none}
.pcard h3{font-size:var(--fs-body);font-weight:700;line-height:20px}
.pcard h3 a,.due .dn{color:inherit;text-decoration:none}
.pcard h3 a:hover,.due .dn:hover{text-decoration:underline}
.pcard .pm{font-size:var(--fs-small);color:var(--muted)}
.pcard .pm b{color:var(--fg);font-weight:700}
.pcard .pbar{margin:6px 0 2px}
.pcard .nm{font-size:var(--fs-small);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcard .nm b{color:var(--fg);font-weight:700}
.pcard .nm .mono{margin-left:6px;color:var(--fg)}
.pcard .nm.late .mono{color:var(--red);font-weight:700}
.pmore .pgrid-in{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:16px}
.gl{display:grid;gap:3px;margin:auto 0 0 24px;font-size:var(--fs-small);line-height:16px}
.gl dd+dt{margin-top:8px}
.gl dt{font-weight:700;color:var(--ink)}
.gl dd{margin:0;color:var(--muted)}
.gl .nw{white-space:nowrap;margin-right:12px}
.gl .ln{display:block}
.gl dd b{color:var(--fg);font-weight:700}
.tip{position:fixed;z-index:30;background:var(--ink);color:#ffffff;padding:7px 10px;border-radius:5px;font-size:var(--fs-small);line-height:1.5;max-width:280px;pointer-events:none;box-shadow:3px 3px 0 rgba(20,20,20,.25)}
.tip b{display:block;font-size:var(--fs-body)}
</style>
`;

const markup = `
<div class="stage"><div class="app">
<header>
  <h1>FDE プランニング・デイリー</h1>
  <p class="sub"><span id="week">${WEEK_LABEL}</span><span id="asof"></span></p>
</header>
<section class="summary" aria-label="チーム全体のまとめ">
  <section class="panel box"><h2><span class="sticker b">ミッションとのつながり</span><span class="key" id="mx-key"></span></h2><p class="note">${POLICY}</p><div id="mission"></div></section>
  <section class="panel box"><h2><span class="sticker">Do<sup>3</sup> の実施記録</span><span class="key" id="heat-key"></span></h2><div id="heat"></div></section>
</section>
<nav class="tabsbar"><div class="view-tabs" id="view-tabs" role="tablist" aria-label="表示の切り替え"></div></nav>
<section class="board" id="board" role="tabpanel" aria-labelledby="tab-all"></section>
<div id="views"></div>
</div></div>
<div class="tip" id="tip" hidden role="tooltip"></div>
`;

const code = String.raw`
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const PROJ=Object.fromEntries(PROJECTS.map(p=>[p.id,p]));
const MEMBER=Object.fromEntries(DATA.map(m=>[m.id,m]));
// メンバーの並びは中村を先頭に、あとは DATA の順。カード・タブ・ミッションとのつながり・Do³ の実施記録で同じ
const ORDER=[...DATA.filter(m=>m.id==="nakamura"),...DATA.filter(m=>m.id!=="nakamura")];
const short=m=>m.name.slice(0,2);
const projOf=w=>{if(w.p===null)return null;const p=PROJ[w.p];if(!p)throw new Error("不明なプロジェクト "+w.p);return p;};
const rowLabel=w=>{const p=projOf(w);return p?p.name+(w.task?"｜"+w.task:""):w.task;};
const STATE={started:"In Progress",planned:"Planned",backlog:"Backlog",completed:"Completed"};
const stateOf=p=>{const t=STATE[p.state];if(!t)throw new Error("不明な状態 "+p.state);return t;};
const linkOf=(m,w)=>{const t=w.link,n=+t.slice(1);if(t[0]==="g"){const g=m.goals[n-1];if(!g)throw new Error(m.name+": 上期目標 "+n+" がない（"+rowLabel(w)+"）");return {goal:n,mission:g.m};}if(t[0]==="m"&&MISSION[n])return {goal:0,mission:n};throw new Error(m.name+": つながりの指定が不正 "+t+"（"+rowLabel(w)+"）");};
const inflight=m=>m.ws.filter(w=>w.st!=="done");
const mName=n=>(n?MARK[n]+" ":"")+MISSION[n][0];
const linkTip=(m,l)=>mName(l.mission)+"<br>"+(l.goal?"上期目標 "+l.goal+"："+m.goals[l.goal-1].t:"個人目標に紐づかない");
const mdOf=d=>{const [,m,dd]=d.split("-");return (+m)+"/"+(+dd);};
const LINEAR_ISSUE="https://linear.app/active-core-swat/issue/";
const dayDiff=(a,b)=>(Date.parse(b)-Date.parse(a))/864e5;
const period=p=>(p.start?mdOf(p.start):"未設定")+"〜"+(p.target?mdOf(p.target):"未設定");

// Issue の状態（Linear の並びの逆。完了に近いものから左に積む）。見積もりのない Issue は 1 pt として数える。Done〜In Progress を色付き、ほかはグレー
const IST=["Done","In Customer","In Review","In Progress","pending","Todo","Backlog","Triage"];
// 進み具合：棒の長さ＝開始日〜目標日、本日の位置に線を引く
function progressOf(p){
  const by=IST.map(()=>0);let total=0;
  for(const [si,pts] of p.iss){by[si]+=pts;total+=pts;}
  // 棒の期間＝開始日〜目標日。片方がないときは、マイルストーンのいちばん早い日・遅い日で補う
  if(p.start&&p.target&&p.start>=p.target)throw new Error(p.name+": 期間が不正");
  const msd=p.ms.map(m=>m[1]).filter(Boolean).sort();
  const from=p.start||msd[0]||null,to=p.target||msd[msd.length-1]||null,span=from&&to&&from<to?dayDiff(from,to):null;
  const t=span?Math.min(1,Math.max(0,dayDiff(from,LINEAR_PROJECTS_AS_OF)/span)):null;
  const moved=by[0]+by[1]+by[2]+by[3];
  return {by,total,moved,t,from,to,span,
    overdue:!!p.target&&p.target<LINEAR_PROJECTS_AS_OF,
    msOver:p.ms.filter(m=>m[1]&&m[1]<LINEAR_PROJECTS_AS_OF&&m[2]<100)};
}
// 状態（メンバーごと）：Backlog＝着手前で判定しない。Off track＝目標日か、100% でないマイルストーンの日付を過ぎた（完了したプロジェクトはカードに出さない）。At risk＝本人の期限超過 Issue がある、マイルストーンなし、In Progress で Issue なし。ほかは On track
const STATUS={onTrack:["On track","☀️"],atRisk:["At risk","☁️"],offTrack:["Off track","☔️"],backlog:["Backlog","🌙"]};
const PT={offTrack:3,atRisk:2,onTrack:1};
function statusOf(p,g,m){
  if(p.state==="backlog")return {k:"backlog",why:["着手前のため判定しない"]};
  const off=[],risk=[],over=mine(p,m).filter(r=>r[2]<LINEAR_PROJECTS_AS_OF).length;
  if(g.overdue)off.push("目標日 "+mdOf(p.target)+" を過ぎた");
  g.msOver.forEach(x=>off.push("マイルストーン「"+x[0]+"」の "+mdOf(x[1])+" を過ぎた（"+x[2]+"%）"));
  if(over)risk.push(m.name+" の期限超過 Issue "+over+" 件");
  if(!p.ms.length)risk.push("マイルストーンなし");
  if(p.state==="started"&&!p.iss.length)risk.push("Issue なし");
  return off.length?{k:"offTrack",why:off}:risk.length?{k:"atRisk",why:risk}:{k:"onTrack",why:[]};
}
function stat(k,tip){
  const h=STATUS[k];if(!h)throw new Error("不明な状態 "+k);
  return '<span class="st" role="img" aria-label="'+h[0]+'"'+(tip?' data-tip="'+esc(tip)+'"':"")+">"+h[1]+"</span>";
}
const statusTip=s=>"<b>"+STATUS[s.k][0]+"</b>"+(s.why.length?s.why.map(esc).join("<br>"):"目標日とマイルストーンの日付の前で、期限超過の Issue もない");
const segsOf=(by,total)=>total?IST.map((n,i)=>by[i]?'<i class="is'+i+'" style="width:'+(by[i]/total*100)+'%"></i>':"").join(""):"";
const ptsTip=(by,total)=>IST.map((n,i)=>by[i]?n+" "+by[i]:"").filter(Boolean).join("・")||"Issue なし";
// マイルストーンは目標日の位置に白い点（黒い縁）を置く（棒の長さ＝開始日〜目標日）。日付を過ぎて 100% でないものは赤
function pbar(p,g){
  const dots=g.span?p.ms.map((m,k)=>{if(!m[1])return "";
    const x=Math.min(1,Math.max(0,dayDiff(g.from,m[1])/g.span)),late=m[1]<LINEAR_PROJECTS_AS_OF&&m[2]<100,cls=late?" late":"";
    return '<b class="ms'+cls+'" style="left:calc(4px + (100% - 8px) * '+x+')" data-tip="'+esc("<b>マイルストーン "+(k+1)+" / "+p.ms.length+"</b>"+esc(m[0])+"<br>目標日 "+mdOf(m[1])+"・"+m[2]+"%"+(late?"<br>日付を過ぎて終わっていない":""))+'"></b>';}).join(""):"";
  const unplaced=p.ms.filter(m=>!g.span||!m[1]).length;
  const tip="<b>"+g.total+" pt</b>"+ptsTip(g.by,g.total)+(p.unest?"<br>見積もりなしの Issue "+p.unest+" 件は 1 pt として数えた":"")
    +(unplaced?"<br>日付か期間がなく置けないマイルストーン "+unplaced+" 件":"")+(g.span&&!(p.start&&p.target)?"<br>期間が未設定のため、棒の長さはマイルストーンの日付で補った（"+mdOf(g.from)+"〜"+mdOf(g.to)+"）":"")+"<br>期間 "+period(p)+(g.t!==null?"・本日 "+mdOf(LINEAR_PROJECTS_AS_OF)+"（経過 "+Math.round(g.t*100)+"%）・色の付いた部分 "+(g.total?Math.round(g.moved/g.total*100):0)+"%":"");
  return '<span class="pbar" data-tip="'+esc(tip)+'"><span class="trk">'+segsOf(g.by,g.total)+"</span>"+dots+(g.t!==null?'<b class="today" style="left:calc(4px + (100% - 8px) * '+g.t+')"></b>':"")+"</span>";
}

// 個人カードのプロジェクト：Linear のリードかメンバー。完了したものは出さない
const cardProjects=m=>PROJECTS.filter(p=>p.state!=="completed"&&p.owners.includes(m.id));
// Backlog のプロジェクトは、カードとプロジェクト別の折りたたみの中に置く。開いたときの場所は先に取っておく（閉じている間は見えないだけ）
const inBacklog=p=>p.state==="backlog";
const more=(n,inner)=>'<div class="more"><button type="button" class="more-h" aria-expanded="false">Backlog '+n+" 件</button>"+inner+"</div>";
// 全体進捗：カードのプロジェクトのうち、本人が担当の Issue のポイント
function personBar(m,ps){
  const by=IST.map(()=>0);let total=0;
  ps.forEach(p=>p.iss.forEach(([si,pts,who])=>{if(who===m.id){by[si]+=pts;total+=pts;}}));
  const ss=ps.map(p=>p.start).filter(Boolean).sort(),ts=ps.map(p=>p.target).filter(Boolean).sort();
  const start=ss[0]||null,target=ts[ts.length-1]||null;
  const t=start&&target&&start<target?Math.min(1,Math.max(0,dayDiff(start,LINEAR_PROJECTS_AS_OF)/dayDiff(start,target))):null;
  const tip="<b>"+esc(m.name)+" の全体進捗 "+total+" pt</b>"+ptsTip(by,total)+"<br>カードのプロジェクトの Issue のうち、本人が担当のもの<br>期間はカードのプロジェクトのいちばん早い開始日〜いちばん遅い目標日";
  return pcap('<span class="pbar" data-tip="'+esc(tip)+'"><span class="trk">'+segsOf(by,total)+"</span>"+(t!==null?'<b class="today" style="left:calc(4px + (100% - 8px) * '+t+')"></b>':"")+"</span>",start?mdOf(start):"未設定",target?mdOf(target):"未設定",t);
}
// 全体進捗の見出し・棒・日付（開始・目標）。本日は棒の上の赤い線で示す
const pcap=(bar,start,target,t)=>'<div class="pcap"><div class="pcap-h"><span>全体進捗</span>'
  +"</div>"+bar+'<div class="axis"><span>開始 '+start+"</span><span>目標 "+target+"</span></div></div>";
// 差し込みタスク：赤い枠。ないときは「なし」
const none=t=>'<p class="none">'+t+"</p>";
const callout=items=>items&&items.length?'<div class="callout"><div class="callout-h">差し込みタスク</div><ul>'
  +items.map(x=>"<li><b>"+esc(x.t)+"</b><span>"+esc(x.note)+"</span></li>").join("")+"</ul></div>"
  :'<div class="callout empty"><div class="callout-h">差し込みタスク</div>'+none("なし")+"</div>";
// 取り込んだ日に Do³ の日次を書いたか
function didDo3(m){
  const j=DAYS.indexOf(mdOf(LINEAR_PROJECTS_AS_OF));if(j<0)throw new Error("取り込んだ日が当月の営業日にない");
  return /[FT]/.test(m.cov[j]||"");
}
// 迷い・判断の振り返り：取り込んだ日の Do³ の日次で本人が書いた原文。書いていないときは「記載なし」、その日に Do³ を書いていなければ「Do³ 実施なし」
const warnBox=x=>'<div class="warn"><div class="warn-h">迷い・判断の振り返り<em>'+esc(x.d)+'</em></div><p title="'+esc(x.text)+'">'+esc(x.text)+"</p></div>";
const warn=m=>{if(m.doubt&&m.doubt.d!==mdOf(LINEAR_PROJECTS_AS_OF))throw new Error(m.id+": 迷い・判断が取り込んだ日のものでない "+m.doubt.d);return m.doubt?warnBox(m.doubt):'<div class="warn empty"><div class="warn-h">迷い・判断の振り返り</div>'+none(didDo3(m)?"記載なし":"Do<sup>3</sup> 実施なし")+"</div>";};
// 名前の前の天気：Backlog を除く担当プロジェクトの状態を ☀️ 1・☁️ 2・☔️ 3 pt として平均し、3 段階で出す（[この値以上, 天気]）
const NAME_WX=[[2.5,"☔️"],[2,"☁️"],[-Infinity,"☀️"]];
function headOf(m){
  const ss=cardProjects(m).filter(p=>!inBacklog(p)).map(p=>statusOf(p,progressOf(p),m));
  if(!ss.length)return '<div class="card-head"><h3>'+esc(m.name)+"</h3></div>";
  const n=k=>ss.filter(x=>x.k===k).length,avg=ss.reduce((a,x)=>a+PT[x.k],0)/ss.length,wx=NAME_WX.find(([x])=>avg>=x)[1];
  const tip="<b>"+esc(m.name)+"</b>担当プロジェクトの平均 "+avg.toFixed(2)+" pt（☀️ 1・☁️ 2・☔️ 3）<br>Off track "+n("offTrack")+"・At risk "+n("atRisk")+"・On track "+n("onTrack");
  return '<div class="card-head"><span class="st" role="img" aria-label="平均 '+avg.toFixed(2)+' pt" data-tip="'+esc(tip)+'">'+wx+"</span><h3>"+esc(m.name)+"</h3></div>";
}
// 本人のカード：全体進捗。全メンバーと、メンバーごとの表示の本人の欄で使う
const personCard=m=>'<article class="card box">'+headOf(m)+personBar(m,cardProjects(m))+"</article>";
// 見方：本物のカードと同じ作りのサンプル。全メンバーの左上に置く
function sampleCard(){
  const nw=t=>'<span class="nw">'+t+"</span>",ln=t=>'<span class="ln">'+t+"</span>",rule=(k,t)=>ln(STATUS[k][1]+" <b>"+STATUS[k][0]+"</b>　"+t),sw=(i,t)=>nw('<i class="isw is'+i+'"></i>'+t);
  const bar=(segs,ms,t)=>'<span class="pbar"><span class="trk">'+segs.map(([i,w])=>'<i class="is'+i+'" style="width:'+w+'%"></i>').join("")+"</span>"+ms.map(([x,c])=>'<b class="ms '+c+'" style="left:calc(4px + (100% - 8px) * '+(x/100)+')"></b>').join("")+'<b class="today" style="left:calc(4px + (100% - 8px) * '+(t/100)+')"></b></span>';
  return '<article class="card box sample"><div class="card-head">'+stat("atRisk")+"<h3>サンプル</h3></div>"
    +pcap(bar([[0,38],[1,6],[2,8],[3,10]],[],55),"10/1","12/25",.55)
    +'<dl class="gl">'
    +"<dt>Health</dt><dd>"+rule("offTrack","目標日か、未完了 MS の日付を過ぎた")+rule("atRisk","担当 Issue の期限超過か、必須項目がない")+rule("onTrack","どちらでもない")+rule("backlog","着手前のため判定しない")+"</dd>"
    +"<dt>必須項目（Backlog はなし）</dt><dd>"+nw("<b>Planned</b> MS")+nw("<b>In Progress</b> MS・Issue")+"</dd>"
    +"<dt>名前の天気</dt><dd>"+ln("Backlog を除く担当 PJ の Health の平均（☀️ 1・☁️ 2・☔️ 3 pt）")+NAME_WX.map(([x,w],i)=>nw(w+" "+(i<NAME_WX.length-1?x.toFixed(1)+" 以上":NAME_WX[i-1][0].toFixed(1)+" 未満"))).join("")+"</dd>"
    +"<dt>Issue</dt><dd>"+sw(0,"Done")+sw(1,"In Customer")+sw(2,"In Review")+sw(3,"In Progress")+sw(5,"Others")+"</dd>"
    +"</dl></article>";
}
$("#board").innerHTML=sampleCard()+ORDER.map(personCard).join("");

// ---- ミッションとのつながり：完了していない取り組みを 1 つの点にして、FDE ミッションの列に置く
(function(){
  const cols=[1,2,3,0];
  let h='<div class="mx" role="table" aria-label="取り組みと FDE ミッションのつながり"><div class="mx-row mx-head" role="row"><span></span>'+cols.map(c=>'<span class="mx-h" tabindex="0" data-tip="'+esc("<b>"+mName(c)+"</b>"+MISSION[c][1])+'">'+(c?"<b>"+MARK[c]+"</b>":"")+MISSION[c][0]+"</span>").join("")+"</div>";
  ORDER.forEach(m=>{
    const by={1:[],2:[],3:[],0:[]};
    inflight(m).forEach(w=>{const l=linkOf(m,w);by[l.mission].push([w,l]);});
    h+='<div class="mx-row" role="row"><span class="mx-name">'+short(m)+"</span>"+cols.map(c=>'<span class="mx-cell">'+by[c].map(([w,l])=>'<span class="dot '+w.st+(l.goal?"":" out")+'" tabindex="0" data-tip="'+esc("<b>"+m.name+"："+rowLabel(w)+"</b>"+linkTip(m,l)+"<br>状態："+ST[w.st])+'"></span>').join("")+"</span>").join("")+"</div>";
  });
  $("#mission").innerHTML=h+"</div>";
  $("#mx-key").innerHTML='<span><span class="dot run"></span>個人目標あり</span><span><span class="dot run out"></span>目標外</span><span>色は取り組みの状態</span><span>紐づけは案（本人確認前）</span>';
})();

// ---- Do³ の実施記録：日次は当月の営業日を詰めて並べ、週の最初の日に日付を付ける。週次は右。まだ来ていない日は枠だけ
(function(){
  const pitch=22,size=17,L=48,top=20,wgap=6,gap=14,YEAR=2026;
  const dateOf=d=>{const [mm,dd]=d.split("/").map(Number);return new Date(YEAR,mm-1,dd);};
  const xs=[],firsts=[];let x=L,prev=null;
  DAYS.forEach((d,j)=>{const t=dateOf(d),w=t.getDay();if(w===0||w===6)throw new Error("Do³ の日付が土日 "+d);
    if(!prev||w<=prev.getDay()||(t-prev)/864e5>=7){if(prev)x+=wgap;firsts.push(j);}
    xs.push(x);x+=pitch;prev=t;});
  const wx=x-pitch+size+gap,W=wx+WEEKLY.length*pitch,H=top+DATA.length*pitch;
  const code={F:["var(--heat-full)","完了"],T:["var(--heat-thread)","入力中"],N:["var(--heat-none)","未入力"]};
  let s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="Do3 の日次・週次の実施記録"><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--gray-strong)" stroke-width="1.2"/></pattern></defs>';
  firsts.forEach(j=>{s+='<text class="mono" x="'+xs[j]+'" y="'+(top-6)+'">'+DAYS[j]+"</text>";});
  s+='<text x="'+wx+'" y="'+(top-6)+'">週次</text>';
  ORDER.forEach((m,i)=>{
    const y=top+i*pitch;
    s+='<text x="0" y="'+(y+size-2)+'" style="fill:var(--fg);font-weight:600;font-size:var(--fs-body)">'+short(m)+"</text>";
    DAYS.forEach((d,j)=>{const c=m.cov[j];
      if(c===undefined){s+='<rect x="'+xs[j]+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="2" fill="url(#hatch)"/>';return;}
      const v=code[c];if(!v)throw new Error(m.name+": 不明な記録 "+c);
      s+='<g class="cell" tabindex="0" data-tip="'+esc("<b>"+m.name+" "+d+"</b>"+v[1])+'">'+(c==="T"?'<rect x="'+(xs[j]+1)+'" y="'+(y+1)+'" width="'+(size-2)+'" height="'+(size-2)+'" rx="2" fill="'+v[0]+'" stroke="var(--heat-full)" stroke-width="2"/>':'<rect x="'+xs[j]+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="2" fill="'+v[0]+'"/>')+"</g>";});
    WEEKLY.forEach((d,k)=>{const cx=wx+k*pitch+size/2,cy=y+size/2,c=m.wk[k];
      if(c===undefined){s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(size/2)+'" fill="url(#hatch)"/>';return;}
      const v=code[c];if(!v)throw new Error(m.name+": 不明な週次 "+c);
      s+='<g class="cell" tabindex="0" data-tip="'+esc("<b>"+m.name+" 週次 "+d+"</b>"+v[1])+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+(c==="T"?size/2-1:size/2)+'" fill="'+v[0]+'"'+(c==="T"?' stroke="var(--heat-full)" stroke-width="2"':"")+"/></g>";});
  });
  $("#heat").innerHTML=s+"</svg>";
  $("#heat-key").innerHTML='<span><i style="background:var(--heat-full)"></i>完了</span><span><i style="background:var(--heat-thread);box-shadow:inset 0 0 0 2px var(--heat-full)"></i>入力中</span><span><i style="background:var(--heat-none)"></i>未入力</span>';
})();

// ---- メンバーごとの表示：本人の全体進捗・差し込みタスク・迷い・判断を横に並べ、その下に担当プロジェクトを 1 枚ずつ。Backlog は折りたたみ
// 本日が期限の Issue と、期限を過ぎて終わっていない Issue（Linear の期限日）
// そのタブの本人が担当の分だけ。本日期限を先に、期限超過は新しい順に 5 件まで出し、残りは件数と一覧（ツールチップ）で示す
const DUE_MAX=5;
function mine(p,m){
  if(!p.due)throw new Error(p.name+": 期限の Issue のデータがない");
  return p.due.filter(r=>r[3]===m.id);
}
function dueList(p,m){
  const rows=mine(p,m).sort((a,b)=>b[2].localeCompare(a[2])||a[0].localeCompare(b[0])),shown=rows.slice(0,DUE_MAX),rest=rows.slice(DUE_MAX);
  if(!rows.length)return "";
  const li=([id,t,d,who,st])=>{const over=d<LINEAR_PROJECTS_AS_OF;
    return '<li class="'+(over?"over":"today")+'"><span class="tag">'+(over?"期限超過":"本日期限")+'</span><span class="mono">'+mdOf(d)+'</span><a class="dn" href="'+esc(LINEAR_ISSUE+id)+'" target="_blank" rel="noopener" title="'+esc(id+" "+t+"（"+st+"）")+'">'+esc(t)+"</a></li>";};
  return '<ul class="due">'+shown.map(li).join("")
    +(rest.length?'<li class="rest" data-tip="'+esc("<b>ほかの期限超過 "+rest.length+" 件</b>"+rest.map(([id,t,d])=>mdOf(d)+" "+esc(t)).join("<br>"))+'">ほか期限超過 '+rest.length+" 件</li>":"")+"</ul>";
}
// 次のマイルストーン：100% でないもののうち日付がいちばん早いもの（日付のないものは後ろ）。日付を過ぎていれば赤
function nextMs(p){
  const x=p.ms.filter(m=>m[2]<100).sort((a,b)=>(a[1]||"9999").localeCompare(b[1]||"9999"))[0];
  if(!x)return '<div class="nm">次の MS <b>なし</b></div>';
  return '<div class="nm'+(x[1]&&x[1]<LINEAR_PROJECTS_AS_OF?" late":"")+'" title="'+esc(x[0])+'">次の MS <b>'+esc(x[0])+"</b>"+(x[1]?'<span class="mono">'+mdOf(x[1])+"</span>":"")+"</div>";
}
// プロジェクトのカード：状態・名前・担当・期間・次のマイルストーン・バーと、本人の本日期限・期限超過の Issue
function pcard(m,p){
  const g=progressOf(p),st=statusOf(p,g,m);
  return '<article class="pcard box">'
    +'<div class="ph">'+stat(st.k,statusTip(st))+'<h3><a href="'+esc(p.url)+'" target="_blank" rel="noopener">'+esc(p.name)+'</a></h3></div><div class="pm">担当 <b>'+p.owners.map(id=>short(MEMBER[id])).join("・")+'</b>｜<span class="mono">'+esc(period(p))+"</span>｜"+g.total+" pt</div>"+nextMs(p)+pbar(p,g)+dueList(p,m)+"</article>";
}
const cards=(m,later)=>cardProjects(m).filter(p=>inBacklog(p)===later).map(p=>pcard(m,p)).join("");
function memberView(m){
  const n=cardProjects(m).filter(inBacklog).length;
  return '<section class="mview" id="view-'+m.id+'" role="tabpanel" aria-labelledby="tab-'+m.id+'" hidden><div class="mhead">'+personCard(m)
    +'<div class="mnote">'+callout(m.interrupts)+"</div>"
    +'<div class="mnote">'+warn(m)+"</div></div>"
    +'<div class="pgrid">'+cards(m,false)+"</div>"
    +(n?'<div class="pmore">'+more(n,'<div class="pgrid-in more-list">'+cards(m,true)+"</div>")+"</div>":"")+"</section>";
}
$("#views").innerHTML=DATA.map(memberView).join("");

$("#view-tabs").innerHTML='<button type="button" role="tab" id="tab-all" aria-controls="board" aria-selected="true">全メンバー</button>'
  +ORDER.map(m=>'<button type="button" role="tab" id="tab-'+m.id+'" aria-controls="view-'+m.id+'" aria-selected="false" tabindex="-1">'+esc(short(m))+"</button>").join("");

// ---- 見出しの日付
{
  const [y,mo,d]=LINEAR_PROJECTS_AS_OF.split("-").map(Number),wd="日月火水木金土"[new Date(y,mo-1,d).getDay()];
  $("#asof").textContent=LINEAR_PROJECTS_AS_OF+"（"+wd+"）";
}
// ---- 表示の切り替え（#all / #<メンバー id> で直接開ける）
const tabs=[...document.querySelectorAll('.view-tabs [role="tab"]')];
// 表示中のメンバーのプロジェクトのカードを、Backlog を含めて一番高いものにそろえる
function evenCards(){
  document.querySelectorAll(".mview:not([hidden])").forEach(v=>{const cs=[...v.querySelectorAll(".pcard")];
    cs.forEach(c=>c.style.minHeight="");const h=Math.max(...cs.map(c=>c.offsetHeight));cs.forEach(c=>c.style.minHeight=h+"px");});
}
document.fonts.ready.then(evenCards);
function selectView(name,focus){
  tabs.forEach(t=>{const on=t.id==="tab-"+name;t.setAttribute("aria-selected",on);t.tabIndex=on?0:-1;$("#"+t.getAttribute("aria-controls")).hidden=!on;if(on&&focus)t.focus();});
  try{history.replaceState(null,"","#"+name);}catch(e){}
  evenCards();
  if(typeof fitSlide==="function")fitSlide();
}
tabs.forEach((t,k)=>{t.addEventListener("click",()=>selectView(t.id.slice(4)));
  t.addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const n=tabs[(k+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];selectView(n.id.slice(4),true);}});});
selectView(DATA.some(m=>"#"+m.id===location.hash)?location.hash.slice(1):"all");

// 画面の幅に合わせる：幅 1600 で組み、画面の幅に合わせて縮める（広げる）。縦は中身の高さのまま、はみ出す分はスクロールする
function fitSlide(){
  const s=document.documentElement.clientWidth/1600;
  document.documentElement.style.setProperty("--s",s);
  $(".stage").style.height=$(".app").offsetHeight*s+"px";
}
addEventListener("resize",fitSlide);
new ResizeObserver(fitSlide).observe($(".app"));
fitSlide();
// 折りたたみ（Backlog）の開け閉め
document.addEventListener("click",e=>{const b=e.target.closest(".more-h");if(!b)return;const m=b.parentElement,open=!m.classList.contains("open");m.classList.toggle("open",open);b.setAttribute("aria-expanded",open);evenCards();});

// ---- ツールチップ
const tip=$("#tip");
function showTip(el,x,y){tip.innerHTML=el.dataset.tip;tip.hidden=false;place(x,y);}
function place(x,y){const r=tip.getBoundingClientRect();let left=x+12,topp=y+12;if(left+r.width>innerWidth-8)left=x-r.width-12;if(topp+r.height>innerHeight-8)topp=y-r.height-12;tip.style.left=Math.max(4,left)+"px";tip.style.top=Math.max(4,topp)+"px";}
document.addEventListener("mouseover",e=>{const el=e.target.closest("[data-tip]");if(el)showTip(el,e.clientX,e.clientY);else tip.hidden=true;});
document.addEventListener("mousemove",e=>{if(!tip.hidden)place(e.clientX,e.clientY);});
document.addEventListener("focusin",e=>{const el=e.target.closest("[data-tip]");if(el){const r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.bottom);}else tip.hidden=true;});
document.addEventListener("focusout",()=>{tip.hidden=true;});
`;

const head = `<script>
${DAYS_LINE}${WEEKLY_LINE}// Do³ の実施記録（cov＝日次、wk＝週次）：F=完了（まとめあり） T=入力中（スレッド返信のみ） N=未入力。長さより先の日はまだ来ていない
// 取り組みの状態（ミッションの点の色）
${ST_LINE}// FDE ミッション（Do³ チームのミッション、9/29）と、取り組みのつながり
// ws：{p: PROJECTS の id（プロジェクト外は null）, task: タスク名, st: 本人の進み具合, link: つながり}。link "gN" = 上期目標 N（ミッションは目標から決まる）、"mN" = 目標外でミッション N のみ（0 = その他）
${MISSION_BLOCK}${MARK_LINE}// [FDE] Initiative（Linear）のプロジェクトの写し。名前・担当・期間・状態・マイルストーン（[名前, 日付, 進み %]）・Issue（[状態, pt, 担当, マイルストーン]）の正本は Linear
${ASOF_LINE}${CYCLE_LINE}${projOut}${dataOut}`;

const out = css.trimStart() + markup + "\n" + head + code + "</script>\n";
for (const bad of ["openProject", "drawer", "scrim", "COMMON_SRC", "stChip", "ext(", "rowsOf", "lastFocus", "href(", "weather", "HEALTH", "badge(", "lg-status", ".hb", "legend", "prog\"", "\"notion\""]) {
  if (out.includes(bad)) throw new Error("leftover " + bad);
}
fs.writeFileSync(P, out);
console.log("ok", out.length, "bytes;", PROJECTS.length, "projects;", DATA.length, "members; week", WEEK_LABEL);
