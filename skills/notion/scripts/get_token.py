#!/usr/bin/env python3
"""Verify Chrome Notion session is available."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_client import get_token_v2


def main() -> None:
    token = get_token_v2()
    print(f"OK token_v2 acquired (len={len(token)})")


if __name__ == "__main__":
    main()
