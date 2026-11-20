---
name: fde-dashboard
description: Every weekday at 10:00, asks assignees to check their overdue FDE issues in Linear, then 10 minutes before the day's FDE meeting rebuilds the FDE dashboard, publishes it, and attaches it to the meeting page in Notion
---

# FDE Daily Planning

## Overview

FDE の会議（月曜は「[FDE] プランニング」、火〜金は「[FDE] デイリー」）に向けて、営業日の 10 時に起動し、1 つの会話で次の 2 つを行う。

- 10 時：Google カレンダーで会議の開始時刻を確かめ、開始の 10 分前にダッシュボードを作り直すよう、この会話の中に予約する。続けて Linear から Issue を取り込み、ダッシュボードで「期限超過」と表示される Issue すべてに、担当者へ確認を促すコメントを送る。
- 会議の 10 分前：Linear の Initiative「[FDE]」のプロジェクトと Issue、Slack の Do³ の記録を取り込み、ダッシュボード（Artifact https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5 ）を作り直して公開する。続けて、その日の会議ページを Notion の議事録 DB に用意し、ダッシュボードの HTML ファイルを添付する。会議はそのページを開くだけで始められる。

道具とデータは `~/.claude/scheduled-tasks/fde-dashboard/` にあり、 `src.html` がダッシュボードのデータの正本である。

実行中に守る決まりを次に示す。

| 対象 | 決まり |
| :-- | :-- |
| 外部サービス | Google カレンダーと Slack は読むだけで、変更・投稿はしない。Linear は、期限超過の Issue にコメントを送ることだけを行う。Notion は、その日の FDE の会議ページを作り、ダッシュボードを添付することだけを行う |
| 道具 | 道具のコード（ `*.js` ・ `*.py` ）は直さず、読む必要もない。何を読み何を出すかは、この手順書に書いてある |
| エラー | どこかでエラーが出たら、その時点で止め、エラーの文面をそのまま報告する。やり直しや回り道はしない |
| 触らないもの | 差し込みタスク・今週のプロジェクト・目標は、この実行では触らない |
| 再実行 | `src.html` が今日すでに作り直されていても、そのまま全部の手順を行う |
| 言葉 | ユーザーに書く文は、待っている間の一言も含めてすべて日本語で書き、「FDE デイリー・プランニング（ `<ASOF>` ）」の作業だとわかるようにする |

処理は、10 時に Calendar・Book・Remind と朝の報告を行い、会議の 10 分前に Fetch・Rebuild・Publish・Register・Notion と更新の報告を行う。

## Calendar

今日の日付を `ASOF` （YYYY-MM-DD）とし、暦を確かめる。

```bash
TZ=Asia/Tokyo date +%F
node ~/.claude/scheduled-tasks/fde-dashboard/days.js <ASOF>
```

`days.js` は `{"businessDay": true, "do3Days": ["11/11", ..., "11/18"], "weekly": ["11/12"]}` の形の 1 行を出す。 `businessDay` が false なら、「祝日のため実行なし」とだけ報告して終える。true なら、作業用のフォルダ `OUT` を作る。 `OUT` は、この実行の scratchpad（システムプロンプトにある Scratchpad directory）の下の `fde-<ASOF>` で、絶対パスで扱う。

```bash
mkdir -p <OUT>
```

## Book

ToolSearch を `{"query": "google calendar list_events", "max_results": 5}` で呼んで Google カレンダーの list_events を読み込み、今日の予定を取る。

```json
{"startTime": "<ASOF>T00:00:00", "endTime": "<ASOF>T23:59:59", "orderBy": "startTime", "pageSize": 100}
```

予定のうち、件名がちょうど「[FDE] デイリー」か「[FDE] プランニング」で、 `status` が `cancelled` でないものを会議とする。「[FDE] プランニング領域改善の相談」のように件名が完全に一致しないものは会議ではない。会議が複数あれば、開始がいちばん早いものを使う。会議の開始時刻の 10 分前を、更新の時刻とする（例：開始 10:30 なら 10:20）。

| 状況 | 行うこと |
| :-- | :-- |
| 会議がない、またはすでに始まっている | ダッシュボードは作り直さない。Remind のあと、朝の報告をして終える |
| 更新の時刻まで 10 分以上ある | ToolSearch を `{"query": "select:CronCreate", "max_results": 1}` で呼んで読み込み、CronCreate を下のパラメータで呼ぶ |
| 更新の時刻まで 10 分未満か過ぎているが、会議はまだ始まっていない | 予約しない。朝の報告のあと、続けて Fetch に進む |

```json
{"cron": "<更新の分> <更新の時> <ASOF の日> <ASOF の月> *", "recurring": false, "prompt": "FDE ダッシュボード更新の時刻になった。手順書の Fetch から Notion までと更新の報告を行う。ASOF と OUT は Calendar の値をそのまま使う。"}
```

予約はこの会話の中だけにあり、朝の報告のあと会話が待っている間に、更新の時刻が来ると届く。

## Remind

Fetch の「Linear」と「Linear 472」の 2 つの本文で、Agent ツール（ `subagent_type: "general-purpose"` 、 `run_in_background: true` ）を、1 回のメッセージで同時に起動する。Slack の取得はここでは行わない。2 つとも終わったら、Linear の結果をファイルにする。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/collect.py <ASOF> <OUT>
```

`collect.py` は、ダッシュボードで「期限超過」と表示される Issue を `<OUT>/overdue.json` に `[[ID, 題名, 期限日, 担当者の Linear の表示名], ...]` の形で書く。その各 Issue に、担当者へのコメントを送る。ToolSearch を `{"query": "linear list_comments save_comment", "max_results": 5}` で 1 回だけ呼び、Linear の list_comments・save_comment を読み込む。

同じ日に 2 度送らないよう、Issue ごとに先に `list_comments` を `{"issueId": "<ID>", "orderBy": "createdAt", "limit": 50}` で呼ぶ。結果の `hasNextPage` が `true` なら、返った `cursor` を足して続きを呼び、 `false` になるまで読む。今日（JST）作られたコメントに「ステータス・期限日のご確認をお願いします」を含むものがあれば、その Issue には送らない。なければ `save_comment` を次の本文で呼ぶ。本文の 1 行目と 2 行目は改行 1 つでつなぐ。

```json
{"issueId": "<ID>", "body": "@<担当者の Linear の表示名>\nこちらの issue について、ステータス・期限日のご確認をお願いします！"}
```

Issue どうしは独立なので、 `list_comments` と `save_comment` はそれぞれ 1 回のメッセージで並べて呼んでよい。送り終えたら、Report の朝の報告をする。

## Fetch

Linear・Linear 472・Slack の 3 つの取得を、Agent ツール（ `subagent_type: "general-purpose"` 、 `run_in_background: true` ）で、1 回のメッセージで同時に起動する。プロンプトは下の本文をそのまま使い、 `<ASOF>` ・ `<TODAY>` （ASOF の M/D。例 `11/18` ）・ `<OUT>` ・ `<do3Days>` ・ `<weekly>` だけを Calendar の値に置き換える。この会話では Linear の list_projects・list_issues・list_cycles と Slack を直接呼ばない。

Linear と Linear 472 が終わったら、Slack を待たずに Rebuild の `collect.py` を実行する。Slack が終わったら、Rebuild の残りに進む。

### Linear

```text
FDE ダッシュボード更新の取得（Linear）を行う。Linear は読むだけで、書き込まない。結果はあとで collect.py がこの会話の記録から直接読むので、書き写したりファイルに書いたりしない。「Output has been saved to」で終わるもの以外のエラーが返ったら、やり直さずにそこで止め、呼び出しとエラーの文面をそのまま返す。

1. ToolSearch を {"query": "linear list_projects list_cycles list_issues", "max_results": 5} で 1 回だけ呼び、Linear の list_projects・list_cycles・list_issues を読み込む。道具の名前は「mcp__<Linear の接続名>__list_projects」の形で、接続名は環境によって変わる。
2. list_projects を次のパラメータで 1 回呼ぶ。
   {"initiative": "I-40", "includeMembers": true, "includeMilestones": true, "limit": 50, "fields": ["id","uuid","name","url","sortOrder","status","startDate","targetDate","lead","members","milestones"]}
   結果は大きく、ふつうは「Error: result (… characters …) exceeds maximum allowed tokens. Output has been saved to <path>.txt」とファイルに退避される。先頭に Error と付くが失敗ではなく、結果は退避先にそろっている。そのときは次のコマンドで、プロジェクトの id と状態を 1 行ずつ出す。
   python3 -c 'import json,sys; [print(p["id"], p["status"]["type"]) for p in json.load(open(sys.argv[1]))["projects"]]' <path>
   退避されずにそのまま返ったときは、結果の projects から同じ 2 つを読む。list_projects の続きのページは確かめなくてよい（collect.py が確かめる）。
3. list_cycles を次のパラメータで 1 回呼ぶ。結果は読まなくてよい。
   {"teamId": "099a4fcb-6960-429e-88a3-92d6ea8f8130", "type": "current"}
4. 状態が started・planned・backlog のプロジェクトすべて（P-MRTTOPS-472 は除く）について、list_issues を次のパラメータで呼ぶ。プロジェクトどうしは独立なので、1 回のメッセージで並べて呼んでよい。
   {"project": "<プロジェクトの id>", "limit": 100, "includeArchived": false, "fields": ["id","title","status","statusType","estimate","assignee","projectMilestone","dueDate"]}
   結果の hasNextPage が true なら、返った cursor を "cursor" に足し、ほかは同じパラメータで続きを呼ぶ。hasNextPage が false になるまで続ける。Issue が 0 件のプロジェクトも、1 ページと数える。

返すもの：list_issues を呼んだプロジェクトの id とそれぞれのページ数、すべてが hasNextPage false で終わったか。件数は数えない。
```

### Linear 472

```text
FDE ダッシュボード更新の取得（Linear の P-MRTTOPS-472）を行う。Linear は読むだけで、書き込まない。結果はあとで collect.py がこの会話の記録から直接読むので、書き写したりファイルに書いたりしない。「Output has been saved to」で終わるもの以外のエラーが返ったら、やり直さずにそこで止め、呼び出しとエラーの文面をそのまま返す。

1. ToolSearch を {"query": "linear list_issues", "max_results": 5} で 1 回だけ呼び、Linear の list_issues を読み込む。道具の名前は「mcp__<Linear の接続名>__list_issues」の形で、接続名は環境によって変わる。
2. list_issues を次のパラメータで呼ぶ。
   {"project": "P-MRTTOPS-472", "limit": 100, "includeArchived": false, "fields": ["id","title","status","statusType","estimate","assignee","projectMilestone","dueDate"]}
   結果の hasNextPage が true なら、返った cursor を "cursor" に足し、ほかは同じパラメータで続きを呼ぶ。続きには前の結果の cursor が要るので、1 回ずつ順に呼ぶ。hasNextPage が false になるまで続ける（13 ページ前後になる）。結果には MRTTDEV の Issue も混じるが、そのままでよい。

返すもの：呼んだページ数と、最後が hasNextPage false で終わったか。件数は数えない。
```

### Slack

```text
FDE ダッシュボード更新の取得（Slack の Do³）を行う。Slack は読むだけで、投稿しない。「Output has been saved to」で終わるもの以外のエラーが返ったら、やり直さずにそこで止め、呼び出しとエラーの文面をそのまま返す。

入力
- 今日：<ASOF>（JST）、M/D では <TODAY>
- do3Days：<do3Days>（日次の記号を付ける日。この順に 1 文字ずつ並べる）
- weekly：<weekly>（週次の記号を付ける木曜。空のこともある）
- 書く場所：<OUT>/do3.json と <OUT>/doubts.json

メンバー（この 7 人だけを見る。安藤洋介さん・正者宏太朗さんなど、ほかの人の投稿は無視する）
| id | 名前 | Slack ID |
| :-- | :-- | :-- |
| watanabe | 渡邉駿介 | U0432A0KBJS |
| son | 孫政 | U07BRN5S657 |
| noda | 野田えりか | U04AT808MN0 |
| mukasa | 向笠愛美 | U04ARB7BU5Q |
| enomoto | 榎本巧 | U04D7JEEN2W |
| matsumoto | 松本直 | U08ECJB0UD9 |
| nakamura | 中村勇士 | U0438RB4V8T |
ボット Do3 の Slack ID は U060JE24BQD、チャンネルは #01_1on1_prd_mktops（C0AHUKMEYFQ）である。ユーザーを調べる道具は使わない。

1. ToolSearch を {"query": "slack_read_channel slack_read_thread", "max_results": 5} で 1 回だけ呼び、Slack の slack_read_channel・slack_read_thread を読み込む。道具の名前は「mcp__<Slack の接続名>__slack_read_channel」の形で、接続名は環境によって変わる。

2. 読む範囲を決める。開始日は、do3Days の最初の日と、weekly の各木曜の 3 日前（同じ週の月曜）のうち、いちばん早い日である。年は今日の年とし、月曜が前の年の 12 月に戻るときだけ前の年にする。月曜の日付と、各日の 0 時（JST）のエポック秒は次で出す。
   date -j -v-3d -f '%Y-%m-%d' 2026-11-12 +%F                              # → 2026-11-09
   TZ=Asia/Tokyo date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-09 00:00:00' +%s   # → その日 0 時のエポック秒

3. チャンネルを日ごとに読む。開始日から今日までの各日（土日も含む）について、slack_read_channel を 1 回ずつ呼ぶ。日どうしは独立なので、1 回のメッセージで並べて呼んでよい。
   {"channel_id": "C0AHUKMEYFQ", "oldest": "<その日 0 時のエポック秒>", "latest": "<翌日 0 時のエポック秒>", "limit": 100}
   今日の分は latest を付けない。response_format と cursor は付けない（既定の詳しい形にすると、投稿ごとに Message TS とスレッドの返信数が出る）。
   - 結果がちょうど 100 件なら、その日を 0〜12 時と 12〜24 時に分けて読み直す。
   - 結果が「Error: result (...) exceeds maximum allowed tokens. Output has been saved to <path>.txt」と返ったら、エラーではなく、結果がファイルに退避されただけである。中身は 1 行の JSON で Read では読めないので、次で本文を出して読む。
     python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["messages"])' <path>

4. 投稿を見分ける。結果の投稿は次の形で並ぶ。
   === Message from Do3 <...> (U060JE24BQD, external: SVSS.ltd) at 2026-10-20 09:01:17 JST ===
   Message TS: 1792454477.964129
   <@U04ARB7BU5Q|向笠愛美> <@U060JE24BQD|Do3> do_daily_v2
   Thread: 17 replies (latest: 2026-10-20 11:52:01 JST)
   - 親の投稿：Do3 の投稿で、本文が「<@Slack ID|名前> <@U060JE24BQD|Do3> 種類」のもの。種類は do_daily_v2（日次、営業日の 9:00〜9:05 ごろ）、do_weekly（週次、木曜 17:00 ごろ。中村さんにはない）、do_weekly_manager（中村さんの週次、隔週の月曜 10:30 ごろ）の 3 つを使う。do_monthly・not_completed_list・not_completed_list_weekly・週次の未入力の知らせは使わない。
   - まとめ：Do3 の投稿で、本文の 1 行目が「さんのまとめです！」で終わるもの（例「向笠愛美 / aimi.mukasa / … さんのまとめです！」。「/」の前後の空白はないこともある）。本人のスレッドに投稿されたまとめが、チャンネルにも同じ時刻で流れたものである。1 行目がそうなら、最後が「このまとめで合っていますか？」で終わっていてもまとめである。1 行目がそうでない Do3 の投稿は、内容がまとめに似ていて「この内容で合っていますか？」で終わる確かめであっても、まとめではない。

5. 日次の記号を付ける。do3Days の各日 D と各メンバーについて、D に投稿されたそのメンバー宛ての do_daily_v2 を使い、次の順に決める。
   a. D にそのメンバー宛ての親の投稿がない → N
   b. Thread が 1 replies（ボットのあいさつだけ） → N
   c. Thread の latest と同じ時刻に、そのメンバーのまとめがチャンネルにある → F
   d. ほかは slack_read_thread を {"channel_id": "C0AHUKMEYFQ", "message_ts": "<親の Message TS>"} で呼んでスレッドを読む。Do3 のまとめがあれば F、本人の返信があれば T、どちらもなければ N
   まとめが翌日以降に届いても、スレッドが立った日 D の分として数える。まとめが 2 つあっても 1 つと数える。

6. 週次の記号を付ける。weekly の各木曜 W について、5 と同じ a〜d で決める。使う親の投稿は次のとおり。
   - 中村さん以外：W に投稿された、そのメンバー宛ての do_weekly
   - 中村さん：W の 3 日前（同じ週の月曜）に投稿された do_weekly_manager。その月曜に投稿がなければ N

7. 迷い・判断を写す。今日の do_daily_v2 のスレッドだけを使い、前日以前のスレッドは使わない。返信が 2 件以上あるメンバーは、5 で読んでいなければスレッドを読む。
   ボットは「まず、昨日終わらせられたことは何ですか？」「今日何を終わらせる予定ですか？」のあと、迷い・判断を次の順に尋ね、最後に内容を確かめる。
   - 「昨日の業務や案件の中で、判断に迷った場面はありましたか？」
   - その掘り下げ（「たとえば、…ですか？」「何を基準に判断しましたか？または、どう判断しようと考えていますか？」など）
   - 「では、今日の予定の中で判断に迷いそうな場面はありますか？」と、その掘り下げ（「何を基準に判断しようと考えていますか？」など）
   - 確かめ：「このまとめで合っていますか？」または「この内容で合っていますか？」
   写すのは、「昨日の業務や案件の中で、判断に迷った場面はありましたか？」のあとから確かめの前までの、本人の返信すべてである。返信ごとに原文のまま（改行・記号・「特になし」のような短い答えも含めて）写し、順に改行でつなぐ。確かめへの返信は、迷い・判断を足したり直したりしている部分だけを後ろにつなぎ、「はい、合っています」のような返事やタスクの訂正は写さない。
   健康・家族・休みの理由など、仕事の判断ではない個人的な内容は、その部分だけを「（個人的な内容のため省略）」に置き換える。例：「子どもの発熱で、午後の打ち合わせを動かすか迷いました」→「（個人的な内容のため省略）」。
   今日のスレッドがない、返信が 1 件、または「昨日の業務や案件の中で、判断に迷った場面はありましたか？」に本人が答えていないメンバーは null とする。

8. ファイルを書く。どちらも 7 人全員の分を入れる。
   - <OUT>/do3.json：{"from": "<do3Days の最初の日>", "daily": {"watanabe": "<do3Days の順の記号>", ...}, "weekly": {"<W の M/D>": {"watanabe": "F", ...}}}。weekly が空なら "weekly": {} とする。
   - <OUT>/doubts.json：{"watanabe": {"d": "<TODAY>", "text": "<写した原文>"}, "son": null, ...}
   結果の日本語は「\uXXXX」の形で返ることがあるので、ファイルは python3 で json.dump(..., ensure_ascii=False) を使って書き、文字を元に戻す。書いたら、次で 2 つとも JSON として読めることを確かめる。
   python3 -c 'import json,sys; [json.load(open(f)) for f in sys.argv[1:]]' <OUT>/do3.json <OUT>/doubts.json

返すもの：日次と週次の記号の表、迷い・判断を写した人、スレッドを読んだ数。
```

## Rebuild

Linear と Linear 472 の取得が終わったら、Linear の結果をファイルにする。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/collect.py <ASOF> <OUT>
```

`collect.py` は、この会話の記録（本体、 `subagents/*.jsonl` 、ファイルに退避された結果）から Linear の呼び出しの結果を直接読む。同じ呼び出しが何度もあれば後のものを使うので、Remind で取った結果ではなく、この Fetch で取り直した結果が使われる。会話は環境変数 `CLAUDE_CODE_SESSION_ID` で探し、この変数は実行の環境にすでに入っている。ページが欠けていれば止まる。最後に `projects 36（進行中など 21）| issues 1722（472: 1281）| due 19 | Cycle 95` の形の 1 行を出し、Issue の件数はこの行を正とする。

Slack の取得も終わったら、ダッシュボードを作り直す。どれかが失敗したら後ろを走らせないよう、1 つのコマンドとして `&&` でつないで実行する。

```bash
cd ~/.claude/scheduled-tasks/fde-dashboard && node refresh.js <ASOF> <OUT> <OUT>/do3.json && node extras.js due <OUT>/due.json && node extras.js doubts <OUT>/doubts.json && node rebuild.js src.html && python3 build.py src.html fde-planning-2026-10-05.html
```

出力のうち、報告に使うものを次に示す。

| 出力 | 中身 |
| :-- | :-- |
| `refresh.js` の前半 | 変更の記録（状態・期間・担当の変化、新規・完了・取り消しのプロジェクト、取り消しでミッションとのつながりから外した行、月の切り替え）。なければ「変更の記録なし」 |
| `extras.js due` | 期限の Issue があるプロジェクトと件数。なければ「期限の Issue なし」 |
| `rebuild.js` の最後 | `ok 58074 bytes; 32 projects; 7 members; week 11/16 週（Cycle 95）` の形。 `week` の後ろの値を Register と Report で使う |

## Publish

Artifact ツールで、次の順に公開する。

1. `action: "read"` 、 `url: "https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5"` で読む。結果の 1 行目に「full HTML saved to <パス>.html」と、公開中のページを保存したファイルのパスが出る。
2. そのファイルを Read で最後の行まで読む。大きいので、 `allow_large: true` を付けて 1 回で読む。最後の行まで読まないと、次の publish は「公開中の版を見ていない」として断られる。
3. `file_path: "/Users/yuji.nakamura/.claude/scheduled-tasks/fde-dashboard/src.html"` 、 `url: "https://claude.ai/artifact/XQYFeVcmGrKdYyDXFh4RU5"` で publish する。 `capabilities` と `icon` は渡さない。
4. 結果が「Repeat the identical Artifact call once now」なら、同じ publish をもう 1 回だけ呼ぶ。ほかの理由で断られたら止めて報告する。

## Register

資料データベース（Lumiere）に登録し、写しが同じであることを確かめる。 `<M/D>` は `week` の値の先頭の日付である。

```bash
~/batb/bin/batb save --title "FDE プランニング・デイリー（ダッシュボード、<M/D> 週）" --source ~/.claude/scheduled-tasks/fde-dashboard/fde-planning-2026-10-05.html
cmp ~/.claude/scheduled-tasks/fde-dashboard/fde-planning-2026-10-05.html ~/batb/files/fde-planning-2026-10-05.html
```

## Notion

その日の会議ページを用意し、ダッシュボードを添付する。

```bash
python3 ~/.claude/scheduled-tasks/fde-dashboard/notion_page.py <ASOF>
```

スクリプトは Notion の公式 API で次を行い、最後に「作成」か「既存」、「添付」か「差し替え」、ページの URL を 1 行で出す。

- その日のページがなければ、議事録 DB にある同じ名前のテンプレートから作り、日時をその日にする。その日のページがすでにあれば作らない。
- Rebuild で作った `fde-planning-2026-10-05.html` を、 `fde-dashboard-<ASOF>.html` という名前の File ブロックとして、ページの最初の空の行の前に置く。テンプレートでは、その行はデイリーなら「会話事項」、プランニングなら「アジェンダ」の下にある。
- 同じ名前の添付がすでにあれば、新しいものを同じ位置に置いてから古いものを消し、差し替える。

## Report

報告は、Remind のあとの朝の報告と、Notion のあとの更新の報告の 2 回を、日本語で短く行う。朝の報告の項目を次に示す。

| 項目 | 中身 |
| :-- | :-- |
| ダッシュボードの更新 | 会議の件名と開始時刻、予約した更新の時刻（予約しなかった場合はその理由） |
| 期限超過のコメント | 送った Issue（ID・担当者・題名）と、今日すでに送っていたため送らなかった Issue。0 件なら「期限超過の Issue なし」 |
| 止まった場合 | 止まった手順とエラーの文面 |

更新の報告の項目を次に示す。

| 項目 | 出どころ |
| :-- | :-- |
| 取り込んだ日と週、公開した版 | `ASOF` 、 `rebuild.js` の `week` の値、Publish の結果の版 |
| Notion のページ | `notion_page.py` の最後の行（作成か既存か、添付か差し替えかと URL） |
| 変更の記録 | `refresh.js` の前半 |
| Do³ | 今日の記号（7 人分）と、迷い・判断の原文があった人（Slack の取得の返事） |
| Issue | `collect.py` の Issue の件数と、 `extras.js due` の期限の Issue の件数 |
| 止まった場合 | 止まった手順とエラーの文面 |

## Rerun

更新の報告のあとにユーザーからやり直しを頼まれたら、同じ会話で Fetch から Notion までと更新の報告をもう一度行う。 `ASOF` と `OUT` は Calendar の値をそのまま使う。 `collect.py` は同じ呼び出しのうち後のものを使うので、取り直した結果が使われる。Notion では、添付が新しいものに差し替わる。
