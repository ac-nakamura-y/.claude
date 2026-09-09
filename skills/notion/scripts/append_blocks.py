#!/usr/bin/env python3
"""Append or replace Notion page blocks from markdown (supports [RED]...[/RED])."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_blocks import create_child_page, import_markdown_file, import_markdown_to_page, page_url, strip_frontmatter
from notion_client import get_token_v2, normalize_page_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Import markdown into a Notion page")
    parser.add_argument("page_id", nargs="?", help="Target Notion page UUID")
    parser.add_argument("markdown_file", nargs="?", help="Markdown file path")
    parser.add_argument("--create-child", metavar="PARENT_ID", help="Create child page under parent")
    parser.add_argument("--title", default="Untitled", help="Title for --create-child")
    parser.add_argument("--append", action="store_true", help="Append instead of replace")
    args = parser.parse_args()

    token = get_token_v2()

    if args.create_child:
        page_id = create_child_page(token, args.create_child, args.title)
        print(f"Created child page: {page_url(page_id)}")
        md_file = args.markdown_file or args.page_id
        if md_file and Path(md_file).is_file():
            markdown = strip_frontmatter(Path(md_file).read_text(encoding="utf-8"))
            count = import_markdown_to_page(token, page_id, markdown, replace=not args.append)
            print(f"Imported {count} blocks")
        return

    if not args.page_id or not args.markdown_file:
        parser.error("page_id and markdown_file required unless --create-child is used")

    print(import_markdown_file(args.page_id, args.markdown_file, replace=not args.append))


if __name__ == "__main__":
    main()
