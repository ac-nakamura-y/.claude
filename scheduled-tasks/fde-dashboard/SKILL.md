---
name: fde-dashboard
description: Linear と Do³ の最新で FDE ダッシュボードを更新し、その日の FDE 会議の Notion ページを用意する
---

# FDE ダッシュボード更新

## Overview

Linear の Initiative「[FDE]」のプロジェクトと Issue、Slack の Do³ の記録を取り込み、FDE プランニング・デイリーのダッシュボード（Artifact https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5 ）を作り直して公開する。続けて、その日の FDE の会議ページ（月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」）を Notion の議事録 DB に用意する。ページはダッシュボードへのリンクを持ち、会議はそのページを開くだけで始められる状態にする。道具とデータは `~/.claude/scheduled-tasks/fde-dashboard/` にあり、`src.html` がダッシュボードのデータの正本である。

Linear と Slack は読むだけで、投稿・変更はしない。Notion は、その日の FDE の会議ページを作ることだけを行う。道具のコード（`*.js`・`*.py`）は直さない。どこかでエラーが出たら、その時点で止めて、エラーの文面をそのまま報告する。差し込みタスク・今週のプロジェクト・目標は、この実行では触らない。報告はすべて日本語で書く。

処理は暦の確認、取得、更新、公開、登録、Notion、報告の順に進む。

## 1. 暦の確認

今日の日付（JST）を `ASOF`（YYYY-MM-DD）とし、暦を確かめる。

```bash
node ~/.claude/scheduled-tasks/fde-dashboard/days.js $ASOF
```

`businessDay` が false なら、「祝日のため更新なし」とだけ報告して終える。true なら、出力の `do3Days`（Do³ の日次を取り直す日）と `weekly`（週次を取り直す日）を手順 2 で使う。作業用のフォルダ `OUT` は、この実行の scratchpad の下に `fde-$ASOF` として作る。

## 2. 取得

次の 3 つを、サブエージェントで並行して行う。Linear の結果は、あとで `collect.py` がこの会話の記録から直接読み取る。そのため Linear のサブエージェントには、呼び出しのパラメータを下の表のとおり正確に使わせ、結果を書き写したりファイルに書いたりさせない。返させるのは、呼んだプロジェクトとページごとの件数と `hasNextPage` だけでよい。

### A. Linear：プロジェクト・Cycle・Issue（472 を除く）

| 呼び出し | パラメータ |
| :-- | :-- |
| `list_projects` | `initiative: "I-40"`, `includeMembers: true`, `includeMilestones: true`, `limit: 50`, `fields: ["id","uuid","name","url","sortOrder","status","startDate","targetDate","lead","members","milestones"]` |
| `list_cycles` | `teamId: "099a4fcb-6960-429e-88a3-92d6ea8f8130"`, `type: "current"` |
| `list_issues` | `project: <プロジェクトの id>`, `limit: 100`, `includeArchived: false`, `fields: ["id","title","status","statusType","estimate","assignee","projectMilestone","dueDate"]` |

`list_issues` は、`list_projects` の結果のうち `status.type` が `started`・`planned`・`backlog` のプロジェクトすべてについて呼ぶ。ただし `P-MRTTOPS-472` は B が受け持つので除く。`hasNextPage` が true のあいだは、返った `cursor` を足して同じパラメータで続きを呼ぶ。

### B. Linear：P-MRTTOPS-472 の Issue

`list_issues` を A の表と同じパラメータで `project: "P-MRTTOPS-472"` について呼び、`hasNextPage` が false になるまで `cursor` で続ける。全部で 1,200 件ほど、13 ページ前後になる。

### C. Slack：Do³ の記録と迷い・判断

チャンネル `#01_1on1_prd_mktops`（`C0AHUKMEYFQ`）を読む。メンバーと id は、渡邉駿介（watanabe）、孫政（son）、野田えりか（noda）、向笠愛美（mukasa）、榎本巧（enomoto）、松本直（matsumoto）、中村勇士（nakamura）である。

Do³ の仕組みは次のとおり。営業日の 9:12 ごろ、ボット「Do3」が一人ずつスレッド（do_daily_v2）を開いて質問し、本人がスレッドに返信する。答え終わると、ボットが「〜さんのまとめです！」で始まるまとめを投稿する。まとめは遅れて（夕方や翌日に）その日のスレッドへ届くことがあり、その日の分として数える。ボットのあいさつ（開始の数秒後の投稿）だけのスレッドは、返信なしとみなす。do_monthly は日次ではないので数えない。週次は木曜 17:00 ごろの do_weekly で、中村さんだけは隔週月曜 10:30 ごろの do_weekly_manager である。中村さんの分は、同じ週の木曜の週次として数える。

日次は `do3Days` の各日、週次は `weekly` の各日について、メンバーごとに次の記号を付ける。いちばん早い日の 0 時から今までの履歴を、ページを送って読む。

| 記号 | 意味 |
| :-- | :-- |
| F | その日（その週）の本人のまとめがある |
| T | 本人がスレッドに返信したが、まとめはない |
| N | どちらもない |

迷い・判断は、今日のスレッドだけから取る。前日以前の内容は使わない。本人がボットの迷い・判断の質問（「判断に迷った場面はありましたか？」「何を基準に判断」「今日の予定の中で判断に迷いそうな場面はありますか？」など）に答えた返信を、改行も含めて原文のまま写す。「特になし」のような短い答えもそのまま写す。昨日と今日の両方の質問に答えていれば、順に改行でつなぐ。一つの返信に他の答えが混じっていれば迷い・判断の部分だけを写し、切り分けられなければ返信全体を写す。今日答えていない人は null とする。健康・家族・休みの理由など、仕事の判断でない個人的な内容は写さず、「（個人的な内容のため省略）」に置き換える。

書くファイルは 2 つで、どちらも 7 人全員の分を入れる。

- `$OUT/do3.json`：`{"from": "<do3Days の最初の日>", "daily": {"watanabe": "<do3Days の順の記号>", ...}, "weekly": {"<M/D>": {"watanabe": "F", ...}}}`。`weekly` が空なら `{}` とする。
- `$OUT/doubts.json`：`{"watanabe": {"d": "<今日の M/D>", "text": "<原文>"} | null, ...}`

## 3. 更新

A と B が終わったら、Linear の結果をファイルにする。`collect.py` は環境変数 `CLAUDE_CODE_SESSION_ID` でこの会話の記録を探す。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/collect.py $ASOF $OUT
```

C も終わったら、ダッシュボードを作り直す。

```bash
cd ~/.claude/scheduled-tasks/fde-dashboard
node refresh.js $ASOF $OUT $OUT/do3.json
node extras.js due $OUT/due.json
node extras.js doubts $OUT/doubts.json
node rebuild.js src.html
python3 build.py src.html fde-planning-2026-10-05.html
```

`rebuild.js` が最後に出す `week` の値（例：「10/26 週（Cycle 92）」）を手順 5 と報告で使う。

## 4. 公開

まず Artifact ツールの `read` で `https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5` を読む。続けて、`/Users/yuji.nakamura/.claude/scheduled-tasks/fde-dashboard/src.html` をその `url` に publish する。`capabilities` と `icon` は渡さない。

## 5. 登録

資料データベース（Lumiere）に登録し、写しが同じであることを確かめる。`<M/D>` は `week` の値の先頭の日付である。

```bash
~/batb/bin/batb save --title "FDE プランニング・デイリー（ダッシュボード、<M/D> 週）" --source ~/.claude/scheduled-tasks/fde-dashboard/fde-planning-2026-10-05.html
cmp ~/.claude/scheduled-tasks/fde-dashboard/fde-planning-2026-10-05.html ~/batb/files/fde-planning-2026-10-05.html
```

## 6. Notion

その日の会議ページを用意する。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/notion_page.py $ASOF
```

スクリプトは Notion の公式 API を使う。その日のページがなければ、議事録 DB にある同じ名前のテンプレートから作り、日時をその日にする。その日のページがすでにあれば作らない。どちらの場合も、ページにダッシュボード（Artifact）へのリンクがあることを確かめる。最後に出す行（「作成」または「既存」とページの URL）を報告に使う。

## 7. 報告

短く次を書く。

- 取り込んだ日と `week` の値、公開した Artifact の版
- Notion のページ（作成か既存かと URL）
- `refresh.js` が出した変更の記録（状態・期間・担当の変化、新規や完了のプロジェクト、月の切り替え）
- 今日の Do³ の記号（7 人分）と、迷い・判断の原文があった人
- `extras.js due` が出した期限の Issue の件数
- 止まった場合は、止まった手順とエラーの文面