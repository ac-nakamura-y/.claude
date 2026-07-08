#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
MONTHS = 3

QUERY = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: [OPEN, CLOSED, MERGED], first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { createdAt mergedAt }
    }
  }
}
"""


def parse_dt(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(JST).date()


def week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def resolve_repo(repo: str | None) -> tuple[str, str]:
    if repo:
        owner, name = repo.split("/", 1)
        return owner, name

    full_name = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    owner, name = full_name.split("/", 1)
    return owner, name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", nargs="?", help="owner/repo（省略時はカレントリポジトリ）")
    args = parser.parse_args()

    owner, name = resolve_repo(args.repo)

    result = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={QUERY}", "-f", f"owner={owner}", "-f", f"name={name}", "--paginate"],
        capture_output=True,
        text=True,
        check=True,
    )

    period_end = datetime.now(JST).date()
    period_start = period_end - timedelta(days=MONTHS * 30)

    weekly_open: dict[date, int] = defaultdict(int)
    weekly_merge: dict[date, int] = defaultdict(int)

    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        for pr in json.loads(line)["data"]["repository"]["pullRequests"]["nodes"]:
            created = parse_dt(pr["createdAt"])
            merged = parse_dt(pr.get("mergedAt"))
            if created and period_start <= created <= period_end:
                weekly_open[week_start(created)] += 1
            if merged and period_start <= merged <= period_end:
                weekly_merge[week_start(merged)] += 1

    print("| 週 (月〜日) | Open PR | Merge PR |")
    print("|-------------|---------|----------|")

    weeks: list[date] = []
    total_open = 0
    total_merge = 0
    current = week_start(period_start)
    while current <= week_start(period_end):
        weeks.append(current)
        week_end = current + timedelta(days=6)
        opened = weekly_open[current]
        merged = weekly_merge[current]
        total_open += opened
        total_merge += merged
        label = f"{current.strftime('%Y/%m/%d')} 〜 {week_end.strftime('%m/%d')}"
        print(f"| {label} | {opened} | {merged} |")
        current += timedelta(days=7)

    week_count = len(weeks) or 1
    print(f"| **週平均** | **{total_open / week_count:.1f}** | **{total_merge / week_count:.1f}** |")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(error.stderr or error.stdout or str(error), file=sys.stderr)
        raise SystemExit(1)
