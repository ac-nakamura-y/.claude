#!/usr/bin/env python3
"""Read a Notion page from the local notion.db."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_client import NOTION_DB, normalize_page_id


def extract_rich_text(value) -> str:
    if not value:
        return ""
    parts = []
    for segment in value:
        if isinstance(segment, list) and segment:
            parts.append(str(segment[0]))
    return "".join(parts)


def extract_props(props_json: str) -> dict[str, str]:
    data = json.loads(props_json)
    result: dict[str, str] = {}
    for key, value in data.items():
        if key == "title":
            result["title"] = extract_rich_text(value)
        elif isinstance(value, list) and value and isinstance(value[0], list):
            result[key] = extract_rich_text(value)
    return result


def get_text_blocks(
    conn: sqlite3.Connection,
    page_id: str,
    depth: int = 0,
    max_depth: int = 5,
) -> tuple[list[str], bool]:
    if depth > max_depth:
        return [], True

    row = conn.execute("SELECT content FROM block WHERE id=?", (page_id,)).fetchone()
    if not row or not row[0]:
        return [], False

    texts: list[str] = []
    truncated = False
    prefixes = {
        "header": "# ",
        "sub_header": "## ",
        "sub_sub_header": "### ",
        "bulleted_list": "- ",
        "numbered_list": "1. ",
        "quote": "> ",
        "callout": "> ",
    }

    for block_id in json.loads(row[0]):
        block = conn.execute(
            "SELECT id, type, properties, content FROM block WHERE id=? AND alive=1",
            (block_id,),
        ).fetchone()
        if not block:
            continue

        block_type = block[1]
        props = json.loads(block[2]) if block[2] else {}
        line = None

        if block_type in prefixes or block_type in ("text", "toggle", "to_do"):
            title = extract_rich_text(props.get("title", []))
            prefix = prefixes.get(block_type, "")
            if block_type == "to_do":
                checked = props.get("checked", [[False]])[0][0]
                prefix = "[x] " if checked else "[ ] "
            line = f"{prefix}{title}".strip()
        elif block_type == "code":
            title = extract_rich_text(props.get("title", []))
            language = extract_rich_text(props.get("language", [[""]]))
            line = f"```{language}\n{title}\n```"
        elif block_type == "divider":
            line = "---"

        if line:
            texts.append(line)
        if block[3]:
            child_texts, child_truncated = get_text_blocks(conn, block_id, depth + 1, max_depth)
            texts.extend(child_texts)
            truncated = truncated or child_truncated

    return texts, truncated


def read_page(page_id: str) -> dict:
    if not NOTION_DB.exists():
        raise RuntimeError(f"notion.db not found: {NOTION_DB}")

    conn = sqlite3.connect(f"file:{NOTION_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, type, properties, content, parent_id, parent_table FROM block WHERE id=?",
        (page_id,),
    ).fetchone()
    if not row:
        conn.close()
        raise RuntimeError(f"page not found in local db: {page_id}")

    props = extract_props(row["properties"])
    body, truncated = get_text_blocks(conn, page_id)
    conn.close()

    return {
        "id": row["id"],
        "type": row["type"],
        "parent_id": row["parent_id"],
        "parent_table": row["parent_table"],
        "properties": props,
        "body": body,
        "body_text": "\n".join(body),
        "truncated": truncated,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Read a Notion page from local notion.db")
    parser.add_argument("page_id", help="Notion page UUID")
    parser.add_argument("--format", choices=("json", "text"), default="json")
    args = parser.parse_args()

    page = read_page(normalize_page_id(args.page_id))
    if args.format == "text":
        print(page["properties"].get("title", page["id"]))
        print()
        print(page["body_text"])
        if page["truncated"]:
            print("\n[truncated: nested blocks beyond max depth were omitted]")
    else:
        print(json.dumps(page, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
