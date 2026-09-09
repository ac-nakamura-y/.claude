"""Notion block helpers: create pages, import markdown, red highlights."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from notion_client import get_space_id, get_token_v2, notion_headers, normalize_page_id

RED_OPEN = "[RED]"
RED_CLOSE = "[/RED]"
MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
NOTION_PAGE_URL = re.compile(r"(?:https?://)?(?:www\.)?(?:app\.)?notion\.(?:so|com)/(?:[^/]+/)?(?:[a-zA-Z0-9-]+-)?([0-9a-f]{32})", re.I)


def extract_notion_page_id(url: str) -> str | None:
    match = NOTION_PAGE_URL.search(url)
    if not match:
        return None
    raw = match.group(1)
    return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"


def page_mention(page_id: str, space_id: str) -> list:
    page_id = normalize_page_id(page_id)
    return [["‣", [["p", page_id, space_id]]]]


def _make_segment(text: str, bold: bool = False, red: bool = False, link: str | None = None) -> list:
    seg: list = [text]
    ann: list = []
    if bold:
        ann.append(["b"])
    if red:
        ann.append(["a", "red_background"])
    if link:
        ann.append(["a", link])
    if ann:
        seg.append(ann)
    return seg


def parse_inline_text(text: str, bold: bool = False, red: bool = False, space_id: str | None = None) -> list:
    segments: list = []
    pos = 0
    for match in MD_LINK.finditer(text):
        if match.start() > pos:
            segments.extend(parse_inline_text(text[pos : match.start()], bold=bold, red=red, space_id=space_id))
        label, url = match.group(1), match.group(2)
        page_id = extract_notion_page_id(url) if space_id else None
        if page_id:
            segments.append(["‣", [["p", page_id, space_id]]])
        else:
            segments.append(_make_segment(label, bold=bold, red=red, link=url))
        pos = match.end()
    if pos < len(text):
        chunk = text[pos:]
        if chunk:
            segments.append(_make_segment(chunk, bold=bold, red=red))
    return segments


def rich_text_segments(text: str, default_red: bool = False, space_id: str | None = None) -> list:
    segments: list = []
    pattern = re.compile(re.escape(RED_OPEN) + r"(.*?)" + re.escape(RED_CLOSE), re.DOTALL)
    pos = 0
    for match in pattern.finditer(text):
        if match.start() > pos:
            chunk = text[pos : match.start()]
            if chunk:
                segments.extend(parse_inline_text(chunk, red=default_red, space_id=space_id))
        segments.extend(parse_inline_text(match.group(1), red=True, space_id=space_id))
        pos = match.end()
    if pos < len(text):
        segments.extend(parse_inline_text(text[pos:], red=default_red, space_id=space_id))
    if not segments:
        segments.append([""])
    return segments


def _segment(text: str, red: bool, space_id: str | None = None) -> list:
    if not text:
        return []
    return parse_inline_text(text, red=red, space_id=space_id)


def notion_post(token: str, endpoint: str, body: dict, retries: int = 5) -> dict:
    import time as _time

    last_exc: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(
            f"https://www.notion.so/api/v3/{endpoint}",
            data=json.dumps(body).encode(),
            headers=notion_headers(token),
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            if exc.code == 429 and attempt < retries - 1:
                _time.sleep(2 ** attempt + 1)
                last_exc = exc
                continue
            raise RuntimeError(f"Notion {endpoint} HTTP {exc.code}: {detail}") from exc
    raise RuntimeError(f"Notion {endpoint} failed after retries") from last_exc


def save_transactions(token: str, ops: list[dict]) -> None:
    space_id = get_space_id()
    operations = [
        {
            "pointer": {"table": op["table"], "id": op["id"], "spaceId": space_id},
            "path": op["path"],
            "command": op["command"],
            "args": op["args"],
        }
        for op in ops
    ]
    body = {
        "requestId": str(uuid.uuid4()),
        "transactions": [
            {
                "id": str(uuid.uuid4()),
                "spaceId": space_id,
                "debug": {"userAction": "notion-blocks"},
                "operations": operations,
            }
        ],
    }
    notion_post(token, "saveTransactionsFanout", body)


def load_page_block(token: str, page_id: str) -> dict:
    data = notion_post(
        token,
        "syncRecordValues",
        {"requests": [{"pointer": {"table": "block", "id": page_id}, "version": -1}]},
    )
    record = data.get("recordMap", {}).get("block", {}).get(page_id, {})
    value = record.get("value", {})
    if isinstance(value, dict) and "value" in value:
        value = value["value"]
    if not value:
        raise RuntimeError(f"Page not found: {page_id}")
    return value


def make_block_args(block_id: str, parent_id: str, block_type: str, title: list, space_id: str) -> dict:
    return {
        "type": block_type,
        "id": block_id,
        "parent_id": parent_id,
        "parent_table": "block",
        "alive": True,
        "properties": {"title": title},
        "space_id": space_id,
    }


def append_block_ops(
    parent_id: str,
    block_id: str,
    block_type: str,
    title: list,
    space_id: str,
    after: str | None = None,
) -> list[dict]:
    list_args: dict = {"id": block_id}
    if after:
        list_args["after"] = after
    now = int(time.time() * 1000)
    return [
        {
            "id": block_id,
            "table": "block",
            "path": [],
            "command": "set",
            "args": make_block_args(block_id, parent_id, block_type, title, space_id),
        },
        {
            "id": parent_id,
            "table": "block",
            "path": ["content"],
            "command": "listAfter",
            "args": list_args,
        },
        {
            "id": block_id,
            "table": "block",
            "path": [],
            "command": "update",
            "args": {"created_time": now, "last_edited_time": now},
        },
    ]


def delete_children_ops(page_id: str, child_ids: list[str]) -> list[dict]:
    ops: list[dict] = []
    for child_id in child_ids:
        ops.append(
            {
                "id": child_id,
                "table": "block",
                "path": [],
                "command": "update",
                "args": {"alive": False},
            }
        )
        ops.append(
            {
                "id": page_id,
                "table": "block",
                "path": ["content"],
                "command": "listRemove",
                "args": {"id": child_id},
            }
        )
    return ops


def parse_markdown_line(line: str, space_id: str) -> tuple[str, list]:
    block_type = "text"
    text = line
    default_red = False

    if line.startswith("### "):
        block_type = "sub_sub_header"
        text = line[4:]
    elif line.startswith("## "):
        block_type = "sub_header"
        text = line[3:]
    elif line.startswith("# "):
        block_type = "header"
        text = line[2:]
    elif line.startswith("- "):
        block_type = "bulleted_list"
        text = line[2:]
    elif re.match(r"^\d+\.\s", line):
        block_type = "numbered_list"
        text = re.sub(r"^\d+\.\s", "", line)

    title = rich_text_segments(text, default_red=default_red, space_id=space_id)
    return block_type, title


def markdown_to_block_ops(markdown: str, page_id: str, space_id: str) -> list[dict]:
    ops: list[dict] = []
    after: str | None = None
    lines = markdown.splitlines()
    i = 0
    in_code = False
    code_lines: list[str] = []

    while i < len(lines):
        line = lines[i]

        if line.startswith("```"):
            if not in_code:
                in_code = True
                code_lines = []
            else:
                block_id = str(uuid.uuid4())
                text = "\n".join(code_lines)
                block_ops = append_block_ops(page_id, block_id, "code", [[text]], space_id, after)
                ops.extend(block_ops)
                after = block_id
                in_code = False
                code_lines = []
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if not line.strip():
            i += 1
            continue

        if line.strip() == "---":
            i += 1
            continue

        block_type, title = parse_markdown_line(line, space_id)
        block_id = str(uuid.uuid4())
        block_ops = append_block_ops(page_id, block_id, block_type, title, space_id, after)
        ops.extend(block_ops)
        after = block_id
        i += 1

    return ops


def strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            return text[end + 5 :].lstrip("\n")
    return text


def submit_ops_in_batches(token: str, ops: list[dict], batch_ops: int = 21) -> None:
    for start in range(0, len(ops), batch_ops):
        batch = ops[start : start + batch_ops]
        if batch:
            save_transactions(token, batch)
            time.sleep(0.75)


def revive_page_ops(page_id: str, parent_id: str, after: str | None = None) -> list[dict]:
    import time

    now = int(time.time() * 1000)
    list_args: dict = {"id": page_id}
    if after:
        list_args["after"] = after
    return [
        {
            "id": page_id,
            "table": "block",
            "path": [],
            "command": "update",
            "args": {"alive": True, "last_edited_time": now},
        },
        {
            "id": parent_id,
            "table": "block",
            "path": ["content"],
            "command": "listAfter",
            "args": list_args,
        },
    ]


def attach_page_ops(page_id: str, parent_id: str, after: str | None = None) -> list[dict]:
    list_args: dict = {"id": page_id}
    if after:
        list_args["after"] = after
    return [
        {
            "id": parent_id,
            "table": "block",
            "path": ["content"],
            "command": "listAfter",
            "args": list_args,
        }
    ]


def create_child_page(token: str, parent_id: str, title: str) -> str:
    parent_id = normalize_page_id(parent_id)
    space_id = get_space_id()
    page_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    ops = [
        {
            "id": page_id,
            "table": "block",
            "path": [],
            "command": "set",
            "args": {
                "type": "page",
                "id": page_id,
                "parent_id": parent_id,
                "parent_table": "block",
                "alive": True,
                "properties": {"title": [[title]]},
                "space_id": space_id,
            },
        },
        {
            "id": parent_id,
            "table": "block",
            "path": ["content"],
            "command": "listAfter",
            "args": {"id": page_id},
        },
        {
            "id": page_id,
            "table": "block",
            "path": [],
            "command": "update",
            "args": {"created_time": now, "last_edited_time": now},
        },
    ]
    save_transactions(token, ops)
    return page_id


def import_markdown_to_page(token: str, page_id: str, markdown: str, replace: bool = True) -> int:
    page_id = normalize_page_id(page_id)
    space_id = get_space_id()
    children = load_page_children_local(page_id)
    if not children:
        page = load_page_block(token, page_id)
        children = page.get("content") or []

    ops: list[dict] = []
    if replace and children:
        ops.extend(delete_children_ops(page_id, children))

    content_ops = markdown_to_block_ops(markdown, page_id, space_id)
    ops.extend(content_ops)

    submit_ops_in_batches(token, ops)
    return len(content_ops) // 3


def load_page_children_local(page_id: str) -> list[str]:
    import json
    import sqlite3
    from notion_client import NOTION_DB

    if not NOTION_DB.exists():
        return []
    conn = sqlite3.connect(f"file:{NOTION_DB}?mode=ro", uri=True)
    row = conn.execute("SELECT content FROM block WHERE id=?", (normalize_page_id(page_id),)).fetchone()
    conn.close()
    if row and row[0]:
        return json.loads(row[0])
    return []


def page_url(page_id: str) -> str:
    return f"https://www.notion.so/{page_id.replace('-', '')}"


def import_markdown_file(page_id: str, file_path: str | Path, replace: bool = True) -> str:
    text = Path(file_path).read_text(encoding="utf-8")
    markdown = strip_frontmatter(text)
    token = get_token_v2()
    count = import_markdown_to_page(token, page_id, markdown, replace=replace)
    return f"OK imported {count} blocks to {page_url(page_id)}"
