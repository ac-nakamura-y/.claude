"""その日の FDE の会議ページを Notion の議事録 DB（marutto_議事録）に用意し、ダッシュボードの HTML ファイルを添付する。
月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」。ページは、議事録 DB にある同じ名前のテンプレートから作り、日時をその日にする。
その日のページがすでにあれば作らない。
ダッシュボード（fde-planning-2026-10-05.html）は、ページの最初の空の行（テンプレートでは、デイリーは「会話事項」、プランニングは「アジェンダ」の下）へ、fde-dashboard-<asOf>.html という名前で添付する。
ページの用意と添付の確認は Notion の公式 API で、添付そのものは Ego Lite で Notion の画面から行う。すでに添付があれば添付しない。

Usage: python3 notion_page.py <asOf YYYY-MM-DD>
  認証は Notion の公式 API のトークン（~/.config/notion/token）を使う。トークンのコネクトを議事録 DB に接続しておく。
  Ego Lite で Notion にログインしておく。
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request
from datetime import date

DATA_SOURCE = "abeba0ce-266d-4d57-9684-05cf19f6bbb0"  # marutto_議事録
DASHBOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fde-planning-2026-10-05.html")
TOKEN = open(os.path.expanduser("~/.config/notion/token")).read().strip()

as_of = sys.argv[1]
day = date.fromisoformat(as_of)
if day.weekday() > 4: sys.exit(f"{as_of} は平日でない")
TITLE = "[FDE] プランニング" if day.weekday() == 0 else "[FDE] デイリー"
NAME = f"fde-dashboard-{as_of}.html"

def api(method, path, body=None):
    req = urllib.request.Request("https://api.notion.com/v1/" + path, data=None if body is None else json.dumps(body).encode(), method=method,
                                 headers={"Authorization": "Bearer " + TOKEN, "Notion-Version": "2025-09-03", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path}: HTTP {e.code} {e.read().decode(errors='replace')[:500]}")

# ---- その日のページを探す（なければ、同じ名前のテンプレートから作る）
pages = api("POST", f"data_sources/{DATA_SOURCE}/query", {"filter": {"and": [
    {"property": "カテゴリ", "select": {"equals": "FDE"}},
    {"property": "会議名", "title": {"equals": TITLE}},
    {"property": "日時", "date": {"equals": as_of}}]}})["results"]
if len(pages) > 1: sys.exit(f"{as_of} の「{TITLE}」が {len(pages)} 件ある（1 件にしてから実行する）")
if pages:
    page, made = pages[0], False
else:
    templates = [t for t in api("GET", f"data_sources/{DATA_SOURCE}/templates")["templates"] if t["name"] == TITLE]
    if len(templates) != 1: sys.exit(f"議事録 DB に「{TITLE}」のテンプレートが {len(templates)} 個ある（1 個のはず）")
    page, made = api("POST", "pages", {
        "parent": {"type": "data_source_id", "data_source_id": DATA_SOURCE},
        "template": {"type": "template_id", "template_id": templates[0]["id"]},
        "properties": {"会議名": {"title": [{"text": {"content": TITLE}}]},
                       "カテゴリ": {"select": {"name": "FDE"}},
                       "日時": {"date": {"start": as_of}}}}), True

def children(): return api("GET", f"blocks/{page['id']}/children?page_size=100")["results"]
def attached(blocks): return any(b["type"] == "file" and b["file"].get("name") == NAME for b in blocks)

# ---- 添付先の空の行を探す（テンプレートの中身は作成のあと少し遅れて入る）
for _ in range(30):
    blocks = children()
    slot = next((b["id"] for b in blocks if b["type"] == "paragraph" and not b["paragraph"]["rich_text"]), None)
    if attached(blocks) or slot: break
    time.sleep(2)
else: sys.exit("ページに、添付先の空の行がない")

# ---- Ego Lite で、空の行を File ブロックにしてダッシュボードを添付する
uploaded = not attached(blocks)
if uploaded:
    file = os.path.join(tempfile.mkdtemp(), NAME)
    shutil.copyfile(DASHBOARD, file)
    script = "const INPUT = " + json.dumps({"space": f"FDE 会議ページへの添付 {as_of}", "url": page["url"], "slot": slot, "file": file, "name": NAME}) + ";\n" + """
const task = await taskSpace(INPUT.space);
const page = (await task.pages())[0] ?? (await task.newPage());
await page.goto(INPUT.url, { timeout: 60000, waitUntil: "domcontentloaded" });
const slot = '[data-block-id="' + INPUT.slot + '"] [contenteditable="true"]';
await page.waitForSelector(slot, { state: "visible", timeout: 60000 });
await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), slot);
await page.click(slot, { label: "添付先の空の行" });
await page.keyboard.type("/file");
await page.waitForSelector('text="Filtered results"', { state: "visible", timeout: 10000 });
await page.keyboard.press("Enter");
await page.waitForSelector('text="Choose a file"', { state: "visible", timeout: 10000 });
const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
await page.click('text="Choose a file"', { label: "添付するファイルを選ぶ" });
await (await chooserPromise).setFiles(INPUT.file);
await page.waitForFunction((name) => [...document.querySelectorAll(".notion-file-block")].some((b) => b.innerText.includes(name) && /\\d\\s*(B|KiB|MiB)\\b/.test(b.innerText)), INPUT.name, { timeout: 120000 });
await page.waitForTimeout(3000);
await task.finish({ keep: [] });
"""
    r = subprocess.run(["ego-browser", "nodejs"], input=script, text=True, capture_output=True, timeout=300)
    if r.returncode: sys.exit(f"Ego Lite での添付に失敗した（Notion にログインしているか確かめる）\n{r.stdout}{r.stderr}")
    for _ in range(30):
        if attached(children()): break
        time.sleep(2)
    else: sys.exit(f"画面では添付したが、ページに {NAME} の File ブロックが見つからない")
print(("作成" if made else "既存") + f" {TITLE} {as_of} " + ("添付" if uploaded else "添付済み") + f" {page['url']}")
