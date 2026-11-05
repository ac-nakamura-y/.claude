// 営業日の暦。営業日は土日と日本の祝日を除いた日で、祝日は HOLIDAYS にある年だけ扱う（ない年は止める）。
// Usage: node days.js <asOf YYYY-MM-DD>
//   {"businessDay": 今日が営業日か, "do3Days": Do³ の日次を取り直す日, "weekly": 週次を取り直す日} を出す。
//   Do³ は 5 営業日前（当月の最初の営業日より前なら当月の最初の営業日）から今日まで取り直す。遅れて届いたまとめを拾うため。
//   週次は木曜 17 時ごろに始まるので、その範囲の木曜のうち今日より前の日だけ取り直す。
const HOLIDAYS = {
  2026: ["1/1", "1/12", "2/11", "2/23", "3/20", "4/29", "5/4", "5/5", "5/6", "7/20", "8/11", "9/21", "9/22", "9/23", "10/12", "11/3", "11/23"],
  2027: ["1/1", "1/11", "2/11", "2/23", "3/22", "4/29", "5/3", "5/4", "5/5", "7/19", "8/11", "9/20", "9/23", "10/11", "11/3", "11/23"],
};
const md = d => (d.getMonth() + 1) + "/" + d.getDate();
const parse = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) throw new Error("日付は YYYY-MM-DD で渡す " + s); const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const holidays = y => { const h = HOLIDAYS[y]; if (!h) throw new Error(y + " 年の祝日がない（days.js の HOLIDAYS に足す）"); return h; };
const isBusiness = d => d.getDay() % 6 !== 0 && !holidays(d.getFullYear()).includes(md(d));

// その月の営業日（M/D）と、営業日に当たる木曜（週次）と、平日の祝日
function month(asOf) {
  const a = parse(asOf), days = [], weekly = [], off = [];
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d.getMonth() === a.getMonth(); d.setDate(d.getDate() + 1)) {
    if (isBusiness(d)) { days.push(md(d)); if (d.getDay() === 4) weekly.push(md(d)); }
    else if (d.getDay() % 6 !== 0) off.push(md(d));
  }
  return { days, weekly, off };
}

function span(asOf) {
  const { days, weekly } = month(asOf), today = md(parse(asOf)), i = days.indexOf(today);
  if (i < 0) return { businessDay: false };
  const from = Math.max(0, i - 5);
  return { businessDay: true, do3Days: days.slice(from, i + 1), weekly: weekly.filter(w => days.indexOf(w) >= from && days.indexOf(w) < i) };
}

module.exports = { month, span };
if (require.main === module) console.log(JSON.stringify(span(process.argv[2])));
