---
name: fde-daily-planning
description: Books the FDE dashboard update for 10 minutes before the day's FDE meeting and asks assignees to check their overdue Linear issues
---

# FDE デイリー・プランニング

## Overview

営業日の 10 時に、その日の FDE の会議（月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」）に向けて 2 つのことを行う。

- Google カレンダーで会議の開始時刻を確かめ、ダッシュボードを作り直す定期タスク `fde-dashboard` を、開始の 10 分前に 1 回だけ起動するよう予約する。
- Linear から Issue を取り込み、ダッシュボードで「期限超過」と表示される Issue すべてに、担当者へ確認を促すコメントを送る。

実行中に守る決まりを次に示す。

| 対象 | 決まり |
| :-- | :-- |
| 外部サービス | Google カレンダーは読むだけで、変更しない。Linear は、期限超過の Issue にコメントを送ることだけを行う |
| 道具 | `~/.claude/scheduled-tasks/fde-dashboard/` の道具を使う。道具のコード（ `*.js` ・ `*.py` ）は直さず、読む必要もない |
| エラー | どこかでエラーが出たら、その時点で止め、エラーの文面をそのまま報告する。やり直しや回り道はしない |
| 言葉 | ユーザーに書く文は、待っている間の一言も含めてすべて日本語で書き、「FDE デイリー・プランニング（ `<ASOF>` ）」の作業だとわかるようにする |

処理は Calendar・Book・Fetch・Overdue・Remind・Report の順に進む。

## Calendar

今日の日付を `ASOF` （YYYY-MM-DD）とし、営業日かを確かめる。

```bash
TZ=Asia/Tokyo date +%F
node ~/.claude/scheduled-tasks/fde-dashboard/days.js <ASOF>
```

`days.js` が出す 1 行の `businessDay` が false なら、「祝日のため実行なし」とだけ報告して終える。true なら、作業用のフォルダ `OUT` を作る。 `OUT` は、この実行の scratchpad（システムプロンプトにある Scratchpad directory）の下の `fde-<ASOF>` で、絶対パスで扱う。

```bash
mkdir -p <OUT>
```

## Book

ToolSearch を `{"query": "google calendar list_events", "max_results": 5}` で呼んで Google カレンダーの list_events を読み込み、今日の予定を取る。

```json
{"startTime": "<ASOF>T00:00:00", "endTime": "<ASOF>T23:59:59", "orderBy": "startTime", "pageSize": 100}
```

予定のうち、件名がちょうど「[FDE] デイリー」か「[FDE] プランニング」で、 `status` が `cancelled` でないものを会議とする。「[FDE] プランニング領域改善の相談」のように件名が完全に一致しないものは会議ではない。会議が複数あれば、開始がいちばん早いものを使う。

会議の開始時刻の 10 分前を、起動の時刻とする（例：開始 `2026-11-18T10:30:00+09:00` なら `2026-11-18T10:20:00+09:00` ）。ToolSearch を `{"query": "scheduled-tasks update_scheduled_task", "max_results": 5}` で呼んで読み込み、次のどれかを行う。 `update_scheduled_task` には `taskId` と `fireAt` だけを渡す。

| 状況 | 行うこと |
| :-- | :-- |
| 会議がない | 予約しない。Report で「会議なし」と伝える |
| 会議がすでに始まっている | 予約しない。Report で「会議が始まっているため予約なし」と伝える |
| 起動の時刻がまだ来ていない | `update_scheduled_task` を `{"taskId": "fde-dashboard", "fireAt": "<起動の時刻>"}` で呼ぶ |
| 起動の時刻は過ぎたが、会議はまだ始まっていない | `update_scheduled_task` を `{"taskId": "fde-dashboard", "fireAt": "<いまの 2 分後>"}` で呼ぶ |

## Fetch

`~/.claude/scheduled-tasks/fde-dashboard/SKILL.md` の Fetch にある「Linear」と「Linear 472」の 2 つの本文を Read で読み、Agent ツール（ `subagent_type: "general-purpose"` 、 `run_in_background: true` ）で、1 回のメッセージで同時に起動する。プロンプトは本文をそのまま使う。Slack の取得は行わない。この会話では Linear の list_projects・list_issues・list_cycles を直接呼ばない。

2 つとも終わったら、Linear の結果をファイルにする。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/collect.py <ASOF> <OUT>
```

`collect.py` は、この会話の記録から Linear の呼び出しの結果を読み、 `<OUT>/projects.json` と `<OUT>/due.json` などを書く。

## Overdue

ダッシュボードで「期限超過」と表示される Issue を選ぶ。表示されるのは、終わっていないプロジェクトで、期限日が今日より前の終わっていない Issue のうち、担当者が FDE のメンバーで、かつそのプロジェクトのリードかメンバーであるものである。

```bash
python3 - <OUT> <ASOF> <<'EOF'
import json, sys
out, as_of = sys.argv[1:]
FAMILY = {"渡邉駿介": "渡邉", "孫政": "孫", "野田えりか": "野田", "向笠愛美": "向笠", "榎本巧": "榎本", "松本直": "松本", "中村勇士": "中村"}
LINEAR = {"渡邉": "s.watanabe", "孫": "s.son", "野田": "e.noda", "向笠": "a.mukasa", "榎本": "t.enomoto", "松本": "n.matsumoto", "中村": "y.nakamura"}
projects = json.load(open(f"{out}/projects.json"))
rows = []
for key, issues in json.load(open(f"{out}/due.json")).items():
    p = projects[key]
    owners = {FAMILY[n] for n in [p["lead"], *p["members"]] if n in FAMILY}
    rows += [[i, t, d, LINEAR[who]] for i, t, d, who, _ in issues if d < as_of and who in owners]
json.dump(rows, open(f"{out}/overdue.json", "w"), ensure_ascii=False)
print("\n".join(f"{i} {d} @{u} {t}" for i, t, d, u in rows) or "期限超過の Issue なし")
EOF
```

出力の 1 行が 1 件で、Issue の ID・期限日・担当者の Linear の表示名・題名の順に並ぶ。

## Remind

Overdue の各 Issue に、担当者へのコメントを送る。ToolSearch を `{"query": "linear list_comments save_comment", "max_results": 5}` で 1 回だけ呼び、Linear の list_comments・save_comment を読み込む。

同じ日に 2 度送らないよう、Issue ごとに先に `list_comments` を `{"issueId": "<Issue の ID>", "orderBy": "createdAt", "limit": 50}` で呼ぶ。結果の hasNextPage が true なら、返った cursor を "cursor" に足して続きを呼び、hasNextPage が false になるまで読む。今日（JST）作られたコメントに「ステータス・期限日のご確認をお願いします」を含むものがあれば、その Issue には送らない。なければ `save_comment` を次の本文で呼ぶ。 `<表示名>` は Overdue の出力の `@` の後ろの値で、本文の 1 行目と 2 行目は改行 1 つでつなぐ。

```json
{"issueId": "<Issue の ID>", "body": "@<表示名>\nこちらの issue について、ステータス・期限日のご確認をお願いします！"}
```

Issue どうしは独立なので、 `list_comments` と `save_comment` はそれぞれ 1 回のメッセージで並べて呼んでよい。

## Report

日本語で、次の項目を短く報告する。

| 項目 | 中身 |
| :-- | :-- |
| ダッシュボードの更新 | 会議の件名と開始時刻、予約した起動の時刻（予約しなかった場合はその理由） |
| 期限超過のコメント | 送った Issue（ID・担当者・題名）と、今日すでに送っていたため送らなかった Issue。0 件なら「期限超過の Issue なし」 |
| 止まった場合 | 止まった手順とエラーの文面 |
