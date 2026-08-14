"""Shared Notion auth and write helpers for Chrome session cookies."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Optional

import browser_cookie3

CHROME_COOKIE_DIRS = (
    Path.home() / "Library/Application Support/Google/Chrome/Profile 3/Cookies",
    Path.home() / "Library/Application Support/Google/Chrome/Profile 1/Cookies",
    Path.home() / "Library/Application Support/Google/Chrome/Default/Cookies",
)
USER_ID = "182f67ed-59a1-44fc-8ce9-e634d4f2fbac"
SPACE_ID = "5cdf38b3-f525-464f-9874-5ff834c33aa2"
NOTION_DB = Path.home() / "Library/Application Support/Notion/notion.db"
HTTP_TIMEOUT_SEC = 15


def normalize_page_id(page_id: str) -> str:
    page_id = page_id.strip()
    if len(page_id) == 32 and "-" not in page_id:
        return f"{page_id[:8]}-{page_id[8:12]}-{page_id[12:16]}-{page_id[16:20]}-{page_id[20:]}"
    return page_id


def _find_token_in_cookie_file(cookie_file: Path) -> Optional[str]:
    for cookie in browser_cookie3.chrome(cookie_file=str(cookie_file), domain_name="notion.com"):
        if cookie.name == "token_v2":
            return cookie.value
    return None


def _collect_tokens() -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(source: str, token: Optional[str]) -> None:
        if token and token not in seen:
            seen.add(token)
            candidates.append((source, token))

    try:
        for cookie in browser_cookie3.chrome(domain_name="notion.com"):
            if cookie.name == "token_v2":
                add("default profile", cookie.value)
    except Exception:
        pass

    for cookie_file in CHROME_COOKIE_DIRS:
        if not cookie_file.exists():
            continue
        try:
            add(cookie_file.parent.name, _find_token_in_cookie_file(cookie_file))
        except Exception:
            continue

    return candidates


def _validate_token(token: str) -> bool:
    req = urllib.request.Request(
        "https://www.notion.so/api/v3/syncRecordValues",
        data=json.dumps({"requests": [{"table": "space", "id": SPACE_ID, "version": -1}]}).encode(),
        headers=notion_headers(token),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as exc:
        return exc.code != 401
    except Exception:
        return False


def get_token_v2() -> str:
    """Return a working Chrome Notion session cookie token_v2."""
    candidates = _collect_tokens()
    errors: list[str] = []

    for source, token in candidates:
        if _validate_token(token):
            return token
        errors.append(f"{source}: unauthorized")

    if not candidates:
        raise RuntimeError(
            "Notion token_v2 を取得できませんでした。"
            " Chrome で Notion (activecore-swat-btoc) にログインしてください。"
        )

    detail = "; ".join(errors)
    raise RuntimeError(
        "Notion token_v2 は見つかりましたが、いずれも無効です。"
        " Chrome で Notion に再ログインしてください。"
        f" ({detail})"
    )


def notion_headers(token: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Cookie": f"token_v2={token}",
        "x-notion-active-user-header": USER_ID,
        "x-notion-space-id": SPACE_ID,
    }


def sync_record(token: str, page_id: str) -> dict:
    req = urllib.request.Request(
        "https://www.notion.so/api/v3/syncRecordValues",
        data=json.dumps({"requests": [{"table": "block", "id": page_id, "version": -1}]}).encode(),
        headers=notion_headers(token),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
        return json.loads(resp.read())


def write_property(token: str, page_id: str, property_id: str, args) -> None:
    page_id = normalize_page_id(page_id)
    body = {
        "requestId": str(uuid.uuid4()),
        "transactions": [
            {
                "id": str(uuid.uuid4()),
                "operations": [
                    {
                        "pointer": {"table": "block", "id": page_id, "spaceId": SPACE_ID},
                        "path": ["properties", property_id],
                        "command": "set",
                        "args": args,
                    }
                ],
            }
        ],
    }
    req = urllib.request.Request(
        "https://www.notion.so/api/v3/saveTransactions",
        data=json.dumps(body).encode(),
        headers=notion_headers(token),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} for page {page_id}")
