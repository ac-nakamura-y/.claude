#!/usr/bin/env python3
"""Write a Notion database page property via the internal API."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_client import get_token_v2, normalize_page_id, write_property


def main() -> None:
    parser = argparse.ArgumentParser(description="Set a Notion page property via saveTransactions")
    parser.add_argument("page_id", help="Notion page UUID")
    parser.add_argument("property_id", help="Property ID (e.g. e~Y{ for Linear column)")
    parser.add_argument("args_json", help="JSON value for the property args field")
    args = parser.parse_args()

    property_args = json.loads(args.args_json)
    token = get_token_v2()
    page_id = normalize_page_id(args.page_id)
    write_property(token, page_id, args.property_id, property_args)
    print(f"OK updated {page_id} property {args.property_id}")


if __name__ == "__main__":
    main()
