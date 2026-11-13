---
name: session-kickoff
description: Starts a Claude Code background session (claude --bg) with Remote Control for one task, pins it so it keeps waiting for the user instead of being stopped, and unpins it once the caller says it is no longer needed. Used by the scheduled tasks auto-review and do3-morning. Use when a scheduled task or skill hands a task to its own session that the user opens from the Claude Desktop sidebar, claude.ai/code, or a phone.
---

# Session Kickoff

## Overview

作業 1 件ごとに Claude Code の背景セッション（ `claude --bg` ）を Remote Control 付きで始め、本人の返事を待つ間も止まらないよう固定し、要らなくなったら固定を外す。呼び出し側（定期タスク auto-review と do3-morning）は、セッションの名前、場所のフォルダ、指示のファイル、追加の引数、固定するかどうか、固定を外す条件を決める。この Skill は、始め方と固定の仕組みを受け持つ。

背景セッションを動かす常駐のプロセスは、Remote Control 付きのセッションが入力を待ったまま `8` 時間たつと、そのセッションを止める。Remote Control のないセッションは `1` 時間で止める。止まったセッションは Remote Control が切れ、サイドバーや claude.ai から続けられない。固定したセッションは止められない。ただしメモリが足りないときは、固定したセッションも最後に止められる。

固定の読み書きに `jq` を使う（ `jq --version` で確かめる）。

## Start

1. `claude auth status` で CLI のログインを確かめる。ログインしていなくても `claude --bg` はセッションを作り、動かないまま待たせるため、先に確かめる。`loggedIn` が `true` でなければ、どのセッションも始めずに止め、「CLI へのログインが必要（ `claude auth login` ）」と呼び出し側に返す
2. 呼び出し側の決めた中身と置き場所で、指示のファイルを書く
3. 場所のフォルダで背景セッションを始める

```bash
cd "<フォルダ>" && claude --bg --remote-control "<名前>" -w -n "<名前>" <追加の引数> --permission-mode auto "$(cat <指示のファイル>)"
```

`--remote-control` で、Claude Desktop のサイドバー、claude.ai/code、スマホから開けるようにする。Git のリポジトリでは `-w` で、名前を自動で付けた新しい worktree を作り、手元のブランチや変更に触れないようにする。Git のリポジトリでないフォルダでは `-w` を付けない。

出力の `backgrounded · <id> · <名前>` の `<id>` が、セッションを開いたり消したりするときの値である。出力にこの行がなければ、始められなかったものとして、出力の全文と指示のファイルのパスを呼び出し側に返す。

同じ作業のセッションがあるかは、`claude agents --json --all` の `name` で探す。`--all` を付けないと、止まったセッションが一覧に出ない。

## Pin

呼び出し側が固定すると決めたセッションは、始めたらすぐに `<id>` を固定する。固定は `~/.claude/jobs/pins.json` に書く id の配列で、`claude agents` の一覧で `ctrl+t` を押したときと同じ記録である。固定できなかったときは、エラーを呼び出し側に返す。

```bash
jq --arg id '<id>' '(. - [$id]) + [$id]' ~/.claude/jobs/pins.json > ~/.claude/jobs/pins.json.tmp && mv ~/.claude/jobs/pins.json.tmp ~/.claude/jobs/pins.json
```

## Unpin

呼び出し側は実行のたびに、自分が固定したセッションのうち、要らなくなったものの固定を外す。固定を外したセッションは、入力を待ったまま `8` 時間たつと止まる。

固定されている id ごとに、背景セッションの一覧から場所と名前を引く。

```bash
claude agents --json --all | jq -r --slurpfile pins ~/.claude/jobs/pins.json '.[] | select(.kind == "background" and (.id as $id | $pins[0] | index($id))) | [.id, .cwd, .name] | @tsv'
```

| id | 扱い |
| :-- | :-- |
| `pins.json` にあって一覧に出ない（ `claude rm` で消えた） | 固定を外す |
| 名前が呼び出し側の決めた形 | 呼び出し側の条件に当てはまれば固定を外す。条件を確かめられなければ固定を残し、エラーを呼び出し側に返す |
| ほかの名前 | ほかの呼び出し側や本人が固定したものなので触れない |

```bash
jq --arg id '<id>' '. - [$id]' ~/.claude/jobs/pins.json > ~/.claude/jobs/pins.json.tmp && mv ~/.claude/jobs/pins.json.tmp ~/.claude/jobs/pins.json
```

## Operations

本人がターミナルで使う操作を次に示す。

| 操作 | コマンド |
| :-- | :-- |
| 開く | `claude attach <id>` |
| 止まったセッションを、同じ claude.ai の URL のまま再開する | `claude respawn <id>` |
| 作業を終えたセッションを、worktree ごと消す | `claude rm <id>` |
