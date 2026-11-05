"""Linear MCP の結果を、この会話の記録（本体とサブエージェント）から抜き出し、refresh.js と extras.js に渡すファイルを作る。
結果を書き写さずに記録から読むので、件数が多くても写し間違いが起きない。

Usage: python3 collect.py <asOf YYYY-MM-DD> <outdir>
  会話の記録は環境変数 CLAUDE_CODE_SESSION_ID で探す。次の呼び出しの結果を使う（同じ呼び出しが複数あれば後のものを使う）。
  - list_projects: initiative "I-40"、includeMembers・includeMilestones を true、fields に PROJECT_FIELDS を含める
  - list_issues: project ごとに limit 250・fields に ISSUE_FIELDS を含める。hasNextPage が true なら cursor で最後まで続ける
  - list_cycles: teamId は marutto-ops（TEAM）、type "current"
  書くもの: projects.json, issues.json, issues_472.json, due.json, cycle.txt（今週の Cycle 番号）
"""
import glob, json, os, re, sys
from datetime import date, timedelta

PROJECT_FIELDS = {"id", "uuid", "name", "url", "sortOrder", "status", "startDate", "targetDate", "lead", "members", "milestones"}
ISSUE_FIELDS = {"id", "title", "status", "statusType", "estimate", "assignee", "projectMilestone", "dueDate"}
TEAM = "099a4fcb-6960-429e-88a3-92d6ea8f8130"
BIG = "P-MRTTOPS-472"
FAMILY = {"渡邉駿介": "渡邉", "孫政": "孫", "野田えりか": "野田", "向笠愛美": "向笠", "榎本巧": "榎本", "松本直": "松本", "中村勇士": "中村"}
OPEN = {"triage", "backlog", "unstarted", "started"}

as_of, outdir = sys.argv[1], sys.argv[2]
today = date.fromisoformat(as_of)
sid = os.environ.get("CLAUDE_CODE_SESSION_ID") or sys.exit("CLAUDE_CODE_SESSION_ID がない")
main = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{sid}.jsonl"))
if len(main) != 1: sys.exit(f"会話の記録が 1 つに決まらない: {main}")
files = main + sorted(glob.glob(main[0][:-len(".jsonl")] + "/subagents/*.jsonl"), key=os.path.getmtime)

# 記録の順に（呼び出し, 結果）を集める。失敗した呼び出しは捨てる
calls = []
for f in files:
    uses = {}
    for line in open(f):
        content = json.loads(line).get("message", {}).get("content")
        if not isinstance(content, list): continue
        for b in content:
            if b.get("type") == "tool_use" and re.search(r"__list_(projects|issues|cycles)$", b["name"]):
                uses[b["id"]] = (b["name"].rsplit("__", 1)[1], b["input"])
            elif b.get("type") == "tool_result" and b.get("tool_use_id") in uses and not b.get("is_error"):
                body = b["content"]
                text = body if isinstance(body, str) else "".join(x.get("text", "") for x in body if x.get("type") == "text")
                # 大きすぎる結果は記録に載らず、ファイルに退避される。そのときは退避先から読む
                saved = re.search(r"Output has been saved to (\S+\.txt)\.", text)
                if saved: text = open(saved.group(1)).read()
                try: result = json.loads(text)
                except ValueError: continue
                if isinstance(result, dict) and "error" in result: continue
                calls.append((*uses[b["tool_use_id"]], result))

# ---- プロジェクト
projects = [r for n, i, r in calls if n == "list_projects" and i.get("initiative") == "I-40" and PROJECT_FIELDS <= set(i.get("fields", [])) and i.get("includeMembers") and i.get("includeMilestones")]
if not projects: sys.exit("list_projects（I-40、必要な fields・メンバー・マイルストーンつき）の結果がない")
projects = projects[-1]
if projects["hasNextPage"]: sys.exit("list_projects に続きがある")

def pct(v):
    if not re.fullmatch(r"\d+(\.\d+)?%", str(v)): sys.exit(f"マイルストーンの進み具合の形が不正: {v!r}")
    return float(v[:-1])

proj = {}
for p in projects["projects"]:
    proj[p["id"]] = {
        "uuid": p["uuid"], "url": p["url"], "sortOrder": p["sortOrder"], "name": p["name"], "state": p["status"]["type"],
        "start": p["startDate"], "target": p["targetDate"], "lead": p["lead"]["name"] if p["lead"] else None,
        "members": [m["name"] for m in p["members"]],
        "ms": [[m["name"], m["targetDate"], pct(m["progress"])] for m in p["milestones"]],
    }
active = [k for k, p in proj.items() if p["state"] in ("started", "planned", "backlog")]

# ---- Issue：プロジェクトごとにページをつなぎ、最後のページまであることを確かめる
pages = {}
for n, i, r in calls:
    if n == "list_issues" and i.get("project") in proj and ISSUE_FIELDS <= set(i.get("fields", [])):
        pages.setdefault(i["project"], {})[i.get("cursor")] = r
issues = {}
for k in active:
    got, cur, rows = pages.get(k) or sys.exit(f"{k}: list_issues の結果がない"), None, {}
    while True:
        r = got.get(cur) or sys.exit(f"{k}: cursor {cur} のページがない")
        for x in r["issues"]: rows[x["id"]] = x
        if not r["hasNextPage"]: break
        cur = r["cursor"]
    issues[k] = list(rows.values())

def row(x):
    e = x["estimate"]
    if e is not None and not isinstance(e.get("value"), (int, float)): sys.exit(f"{x['id']}: 見積もりの形が不正 {e!r}")
    return [x["status"], None if e is None else e["value"], FAMILY.get(x["assignee"]), x["projectMilestone"]["name"] if x["projectMilestone"] else None]

due = {}
for k in active:
    rows = [[x["id"], x["title"], x["dueDate"], FAMILY.get(x["assignee"]), x["status"]] for x in issues[k]
            if x["dueDate"] and x["dueDate"] <= as_of and x["statusType"] in OPEN]
    due[k] = sorted(rows, key=lambda r: (r[2], r[0].rsplit("-", 1)[0], int(r[0].rsplit("-", 1)[1])))

# ---- 今週の Cycle（月曜 0 時 JST に始まる 1 週間）
cycles = [r for n, i, r in calls if n == "list_cycles" and i.get("teamId") == TEAM and i.get("type") == "current"]
if not cycles or len(cycles[-1]) != 1: sys.exit("list_cycles（marutto-ops の current）の結果がない")
cycle = cycles[-1][0]
monday = today - timedelta(days=today.weekday())
if cycle["startsAt"][:10] != (monday - timedelta(days=1)).isoformat() or not cycle["startsAt"].endswith("T15:00:00.000Z"):
    sys.exit(f"今週の月曜に始まる Cycle ではない: {cycle['startsAt']}")

os.makedirs(outdir, exist_ok=True)
def write(name, v):
    with open(os.path.join(outdir, name), "w") as f: json.dump(v, f, ensure_ascii=False)
write("projects.json", proj)
write("issues.json", {k: [row(x) for x in issues[k]] for k in active if k != BIG})
write("issues_472.json", [row(x) for x in issues[BIG]])
write("due.json", due)
open(os.path.join(outdir, "cycle.txt"), "w").write(str(cycle["number"]))
print(f"projects {len(proj)}（進行中など {len(active)}）| issues {sum(len(issues[k]) for k in active)}（472: {len(issues[BIG])}）| due {sum(map(len, due.values()))} | Cycle {cycle['number']}")
