"""Shared Notion auth and write helpers for Chrome session cookies."""

from __future__ import annotations

import json
import os
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
NOTION_DB = Path.home() / "Library/Application Support/Notion/notion.db"
HTTP_TIMEOUT_SEC = 15
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_dotenv() -> None:
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Copy skills/notion/.env.example to skills/notion/.env "
            "or export the variable in your shell."
        )
    return value


def get_user_id() -> str:
    return _require_env("NOTION_USER_ID")


def get_space_id() -> str:
    return _require_env("NOTION_SPACE_ID")


_load_dotenv()


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
    space_id = get_space_id()
    req = urllib.request.Request(
        "https://www.notion.so/api/v3/syncRecordValues",
        data=json.dumps({"requests": [{"table": "space", "id": space_id, "version": -1}]}).encode(),
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
            " Chrome で Notion にログインしてください。"
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
        "x-notion-active-user-header": get_user_id(),
        "x-notion-space-id": get_space_id(),
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
                        "pointer": {"table": "block", "id": page_id, "spaceId": get_space_id()},
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
