"""その日の FDE の会議ページを Notion の議事録 DB（marutto_議事録）に用意し、ダッシュボードの HTML ファイルを添付する。
月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」。ページは、議事録 DB にある同じ名前のテンプレートから作り、日時をその日にする。
その日のページがすでにあれば作らない。
ダッシュボード（fde-planning-2026-10-05.html）は fde-dashboard-<asOf>.html という名前の File ブロックにして、
ページの最初の空の行（テンプレートでは、デイリーは「会話事項」、プランニングは「アジェンダ」の下）の前に置く。すでに添付があれば添付しない。

Usage: python3 notion_page.py <asOf YYYY-MM-DD>
  認証は Notion の公式 API のトークン（~/.config/notion/token）を使う。トークンのコネクトを議事録 DB に接続しておく。
"""
import json, os, sys, time, urllib.error, urllib.request, uuid
from datetime import date

DATA_SOURCE = "abeba0ce-266d-4d57-9684-05cf19f6bbb0"  # marutto_議事録
DASHBOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fde-planning-2026-10-05.html")
TOKEN = open(os.path.expanduser("~/.config/notion/token")).read().strip()

as_of = sys.argv[1]
day = date.fromisoformat(as_of)
if day.weekday() > 4: sys.exit(f"{as_of} は平日でない")
TITLE = "[FDE] プランニング" if day.weekday() == 0 else "[FDE] デイリー"
NAME = f"fde-dashboard-{as_of}.html"

def api(method, path, body=None, file=None):
    """file を渡すと、そのファイルを NAME の名前で multipart/form-data で送る。"""
    if file:
        boundary = uuid.uuid4().hex
        data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{NAME}"\r\nContent-Type: text/html\r\n\r\n'.encode()
                + open(file, "rb").read() + f"\r\n--{boundary}--\r\n".encode())
        content_type = "multipart/form-data; boundary=" + boundary
    else:
        data, content_type = None if body is None else json.dumps(body).encode(), "application/json"
    req = urllib.request.Request("https://api.notion.com/v1/" + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + TOKEN, "Notion-Version": "2025-09-03", "Content-Type": content_type})
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

# ---- 添付先（最初の空の行の、ひとつ前のブロック）を探す（テンプレートの中身は作成のあと少し遅れて入る）
for _ in range(30):
    blocks = api("GET", f"blocks/{page['id']}/children?page_size=100")["results"]
    attached = any(b["type"] == "file" and b["file"].get("name") == NAME for b in blocks)
    after = next((blocks[i - 1]["id"] for i, b in enumerate(blocks) if i and b["type"] == "paragraph" and not b["paragraph"]["rich_text"]), None)
    if attached or after: break
    time.sleep(2)
else: sys.exit("ページに、添付先の空の行がない")

# ---- ダッシュボードを送り、File ブロックとして置く
if not attached:
    upload = api("POST", "file_uploads", {"filename": NAME, "content_type": "text/html"})
    api("POST", f"file_uploads/{upload['id']}/send", file=DASHBOARD)
    api("PATCH", f"blocks/{page['id']}/children", {"after": after, "children": [
        {"type": "file", "file": {"type": "file_upload", "file_upload": {"id": upload["id"]}, "name": NAME}}]})
print(("作成" if made else "既存") + f" {TITLE} {as_of} " + ("添付済み" if attached else "添付") + f" {page['url']}")
