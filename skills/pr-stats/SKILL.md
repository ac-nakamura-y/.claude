---
name: pr-stats
description: Outputs a weekly Open/Merge PR table for a GitHub repository. Use when the user asks for PR statistics, weekly PR counts, or pr-stats.
---

# PR Stats

このスキルは GitHub リポジトリの Pull Request を直近 `3` ヶ月分、週単位で集計し、Open 数と Merge 数を表形式で出力する。週の区切りは月曜始まり・日曜終わりとし、タイムゾーンは JST を用いる。

## Overview

エージェントは集計スクリプトを実行し、得られた Markdown 表を加工せずそのままユーザーに提示する。表の末尾には週平均行を含めるが、合計行は出力しない。

## How to Run

対象リポジトリの有無に応じて、次のいずれかのコマンドを実行する。

```bash
python3 ~/.claude/skills/pr-stats/scripts/pr-stats.py
python3 ~/.claude/skills/pr-stats/scripts/pr-stats.py owner/repo
```

## Repository Target

リポジトリの解決は、ユーザーの指定の有無で次のとおり切り替える。

| 条件 | 対象 |
| :-- | :-- |
| 指定なし | スキル実行時のカレントディレクトリが指すリポジトリ |
| `owner/repo` の明示あり | ユーザーが指定したリポジトリ |

## Request Examples

次のような依頼で本スキルを起動できる。

| 依頼 | リポジトリ指定 |
| :-- | :-- |
| `/pr-stats` | なし（カレントリポジトリ） |
| 週ごとのPR数を表にして | なし（カレントリポジトリ） |
| ac-llm-platform の直近3ヶ月のOpen/Merge PR数を教えて | `activecore-org/ac-llm-platform` を引数に渡す |
