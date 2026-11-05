"""その日の FDE の会議ページを Notion の議事録 DB（marutto_議事録）に用意する。
月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」。ページは、議事録 DB にある同じ名前のテンプレートから作り、日時をその日にする。
ダッシュボードは、テンプレートに置いた Artifact へのリンク（ブックマーク）で開く。その日のページがすでにあれば作らない。
どちらの場合も、ページにダッシュボードへのリンクがあることを確かめる。

Usage: python3 notion_page.py <asOf YYYY-MM-DD>
  認証は Notion の公式 API のトークン（~/.config/notion/token）を使う。トークンのコネクトを議事録 DB に接続しておく。
"""
import json, os, sys, time, urllib.error, urllib.request
from datetime import date

DATA_SOURCE = "abeba0ce-266d-4d57-9684-05cf19f6bbb0"  # marutto_議事録
ARTIFACT = "https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5"
TOKEN = open(os.path.expanduser("~/.config/notion/token")).read().strip()

as_of = sys.argv[1]
day = date.fromisoformat(as_of)
if day.weekday() > 4: sys.exit(f"{as_of} は平日でない")
TITLE = "[FDE] プランニング" if day.weekday() == 0 else "[FDE] デイリー"

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

# ---- ダッシュボードへのリンクを確かめる（テンプレートの中身は作成のあと少し遅れて入る）
for _ in range(30):
    links = [b for b in api("GET", f"blocks/{page['id']}/children?page_size=100")["results"] if b["type"] == "bookmark" and b["bookmark"]["url"] == ARTIFACT]
    if links: break
    time.sleep(2)
else: sys.exit(f"ページにダッシュボードへのリンク（{ARTIFACT}）がない")
print(("作成" if made else "既存") + f" {TITLE} {as_of} {page['url']}")
