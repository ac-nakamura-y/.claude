"""Read and write 資生堂 meeting pages in the Notion database marutto_議事録.

Usage:
  notion_minutes.py find <会議名> (--on YYYY-MM-DD | --before YYYY-MM-DD)
  notion_minutes.py read <page>
  notion_minutes.py create <会議名> <YYYY-MM-DD> <markdown_file> [--people 原嶋,正者] [--source URL] [--dry-run]
  notion_minutes.py append <page> <markdown_file> [--people 原嶋,正者] [--dry-run]

find --on returns the pages dated on that day and the same-named pages created
within 3 days of it, which catches a page someone made with the wrong date.

The markdown is a small subset that maps one-to-one to Notion blocks:
  "## " heading_2, "### " heading_3, "- " bullet, "1. " numbered,
  "- [ ] " / "- [x] " to_do, any other line a paragraph.
Two spaces of indentation make a line the child of the line above it.
Headings take no children, and inline bold or code is rejected.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

API = "https://api.notion.com/v1/"
NOTION_VERSION = "2025-09-03"
TOKEN_FILE = Path.home() / ".config/notion/token"
DATA_SOURCE_ID = "abeba0ce-266d-4d57-9684-05cf19f6bbb0"
CATEGORY = "資生堂様PJ"
MEMBERS = {
    "原嶋": "1bdd872b-594c-8183-9c17-0002a69c5990",
    "正者": "2bcd872b-594c-8106-a03f-0002edc0723b",
    "中村": "182f67ed-59a1-44fc-8ce9-e634d4f2fbac",
    "榎本": "d157d271-0b03-445a-8f9b-1e807a073bee",
}
MAX_TEXT = 2000
MAX_BATCH = 100
MAX_DEPTH = 2
NEAR_DAYS = 3


def api(method: str, path: str, body: dict | None = None) -> dict:
    if not TOKEN_FILE.is_file():
        raise SystemExit(f"{TOKEN_FILE} がない。Notion インテグレーションのトークンを保存する")
    req = urllib.request.Request(
        API + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN_FILE.read_text().strip()}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{method} {path}: HTTP {exc.code} {exc.read().decode(errors='replace')[:500]}")


def page_id(value: str) -> str:
    raw = value.strip().split("?")[0].rstrip("/").rsplit("/", 1)[-1].replace("-", "")[-32:]
    if not re.fullmatch(r"[0-9a-f]{32}", raw):
        raise SystemExit(f"Notion のページ ID を読み取れない: {value}")
    return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"


def rich_text(text: str) -> list[dict]:
    return [{"type": "text", "text": {"content": text[i:i + MAX_TEXT]}} for i in range(0, len(text), MAX_TEXT)]


def parse_line(content: str) -> dict:
    patterns = [
        (r"## (.+)", lambda m: ("heading_2", {"rich_text": rich_text(m[1])})),
        (r"### (.+)", lambda m: ("heading_3", {"rich_text": rich_text(m[1])})),
        (r"- \[( |x|X)\] (.+)", lambda m: ("to_do", {"rich_text": rich_text(m[2]), "checked": m[1] != " "})),
        (r"- (.+)", lambda m: ("bulleted_list_item", {"rich_text": rich_text(m[1])})),
        (r"\d+\. (.+)", lambda m: ("numbered_list_item", {"rich_text": rich_text(m[1])})),
    ]
    for pattern, build in patterns:
        match = re.fullmatch(pattern, content)
        if match:
            kind, value = build(match)
            return {"object": "block", "type": kind, kind: value}
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich_text(content)}}


def to_blocks(markdown: str) -> list[dict]:
    roots: list[dict] = []
    stack: list[dict] = []
    for number, line in enumerate(markdown.splitlines(), 1):
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent % 2:
            raise SystemExit(f"{number} 行目: インデントは 2 の倍数にする")
        depth = indent // 2
        if depth > len(stack) or depth > MAX_DEPTH:
            raise SystemExit(f"{number} 行目: 親のない行か、{MAX_DEPTH} 段より深い入れ子")
        if "**" in line or "`" in line:
            raise SystemExit(f"{number} 行目: 太字やコードの記法は使えない")
        block = parse_line(line.strip())
        if block["type"].startswith("heading") and depth:
            raise SystemExit(f"{number} 行目: 見出しは入れ子にできない")
        del stack[depth:]
        if depth:
            parent = stack[-1]
            if parent["type"].startswith("heading"):
                raise SystemExit(f"{number} 行目: 見出しの下に入れ子はできない")
            parent[parent["type"]].setdefault("children", []).append(block)
        else:
            roots.append(block)
        stack.append(block)
    return roots


def append_blocks(target: str, blocks: list[dict]) -> None:
    for i in range(0, len(blocks), MAX_BATCH):
        api("PATCH", f"blocks/{target}/children", {"children": blocks[i:i + MAX_BATCH]})


def children(block_id: str) -> list[dict]:
    results, cursor = [], None
    while True:
        query = f"?page_size=100" + (f"&start_cursor={cursor}" if cursor else "")
        page = api("GET", f"blocks/{block_id}/children{query}")
        results += page["results"]
        if not page["has_more"]:
            return results
        cursor = page["next_cursor"]


def render(block_id: str, depth: int = 0) -> list[str]:
    prefix = {"heading_1": "# ", "heading_2": "## ", "heading_3": "### ", "bulleted_list_item": "- ",
              "numbered_list_item": "1. ", "paragraph": "", "quote": "> ", "callout": "> "}
    lines = []
    for block in children(block_id):
        kind = block["type"]
        value = block.get(kind, {})
        text = "".join(part["plain_text"] for part in value.get("rich_text", []))
        if kind == "to_do":
            line = f"- [{'x' if value['checked'] else ' '}] {text}"
        elif kind == "table_row":
            line = "| " + " | ".join("".join(p["plain_text"] for p in cell) for cell in value["cells"]) + " |"
        elif kind in prefix:
            line = prefix[kind] + text
        else:
            line = f"[{kind}] {text}".rstrip()
        lines.append("  " * depth + line)
        if block["has_children"]:
            lines += render(block["id"], depth + (kind != "table"))
    return lines


def find(name: str, on: str | None, before: str | None) -> list[dict]:
    title = {"property": "会議名", "title": {"equals": name}}
    if on:
        day, near = date.fromisoformat(on), timedelta(days=NEAR_DAYS)
        created = [{"timestamp": "created_time", "created_time": {"on_or_after": (day - near).isoformat()}},
                   {"timestamp": "created_time", "created_time": {"on_or_before": (day + near).isoformat()}}]
        query = {"or": [{"and": [title, {"property": "日時", "date": {"equals": on}}]}, {"and": [title, *created]}]}
    else:
        query = {"and": [title, {"property": "日時", "date": {"before": before}}]}
    body = {
        "filter": query,
        "sorts": [{"property": "日時", "direction": "descending"}],
        "page_size": 5,
    }
    rows = api("POST", f"data_sources/{DATA_SOURCE_ID}/query", body)["results"]
    return [{"id": r["id"], "url": r["url"], "日時": (r["properties"]["日時"]["date"] or {}).get("start")} for r in rows]


def people_value(people: list[str]) -> dict:
    unknown = [p for p in people if p not in MEMBERS]
    if unknown:
        raise SystemExit(f"MEMBERS にない参加者: {unknown}（使える名前: {list(MEMBERS)}）")
    return {"people": [{"id": MEMBERS[p]} for p in people]}


def create(name: str, date: str, blocks: list[dict], people: list[str], source: str | None) -> dict:
    properties = {
        "会議名": {"title": rich_text(name)},
        "カテゴリ": {"select": {"name": CATEGORY}},
        "日時": {"date": {"start": date}},
        "参加者": people_value(people),
    }
    if source:
        properties["文字起こし/議論メモ"] = {"url": source}
    page = api("POST", "pages", {"parent": {"data_source_id": DATA_SOURCE_ID}, "properties": properties,
                                 "children": blocks[:MAX_BATCH]})
    append_blocks(page["id"], blocks[MAX_BATCH:])
    return {"id": page["id"], "url": page["url"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p_find = sub.add_parser("find")
    p_find.add_argument("name")
    when = p_find.add_mutually_exclusive_group(required=True)
    when.add_argument("--on")
    when.add_argument("--before")
    sub.add_parser("read").add_argument("page")
    p_create = sub.add_parser("create")
    p_create.add_argument("name")
    p_create.add_argument("date")
    p_create.add_argument("markdown_file")
    p_create.add_argument("--people", default="")
    p_create.add_argument("--source")
    p_create.add_argument("--dry-run", action="store_true")
    p_append = sub.add_parser("append")
    p_append.add_argument("page")
    p_append.add_argument("markdown_file")
    p_append.add_argument("--people", default="")
    p_append.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.command == "find":
        print(json.dumps(find(args.name, args.on, args.before), ensure_ascii=False, indent=2))
    elif args.command == "read":
        print("\n".join(render(page_id(args.page))))
    else:
        blocks = to_blocks(Path(args.markdown_file).read_text())
        if args.dry_run:
            print(json.dumps(blocks, ensure_ascii=False, indent=1))
        elif args.command == "create":
            people = [p for p in args.people.split(",") if p]
            print(json.dumps(create(args.name, args.date, blocks, people, args.source), ensure_ascii=False))
        else:
            target = page_id(args.page)
            append_blocks(target, blocks)
            people = [p for p in args.people.split(",") if p]
            if people:
                api("PATCH", f"pages/{target}", {"properties": {"参加者": people_value(people)}})
            print(json.dumps({"appended": len(blocks), "page": target}))


if __name__ == "__main__":
    sys.exit(main())
