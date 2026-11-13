# はじめかた

自分に届いた PR のレビュー依頼を、Claude Desktop の定期タスク auto-review で 15 分ごとに拾い、レビューの Issue とレビューの背景セッションを用意するための準備。最初に 1 度だけ行う。

やることの中身は [SKILL.md](SKILL.md) にある。ここは準備だけを扱う。

## 1. 必要なもの

| もの | 確かめ方 | 用途 |
| :-- | :-- | :-- |
| Claude Desktop | — | 定期タスクで動かす。背景セッションがサイドバーに出る |
| `session-kickoff` の Skill | `ls ~/.claude/skills/session-kickoff` | 背景セッションを始め、固定し、固定を外す |
| fde プラグイン | `/plugin install fde@activecore` | レビューに使う `fde:code-review` |
| logistics プラグイン | `/plugin install logistics@activecore` | レビューのセッションが依頼元への返信を組み立てる `logistics:team-message` |
| `markdown` と `humanizer` の Skill | `ls ~/.claude/skills/markdown ~/.claude/skills/humanizer` | レビューのセッションが PR のレビューの本文を組み立てて整える |
| `gh` のログイン | `gh auth status` | PR の状態とレビューを読む。レビューのセッションが PR を取り込む |
| `claude` CLI のログイン | `claude auth status` の `loggedIn` が `true`。違えば `claude auth login` | 背景セッションを始める |
| `jq` | `jq --version` | 背景セッションの固定を読み書きする |
| claude.ai の Slack と Linear のコネクタ | Desktop の接続先と、`claude mcp list` の両方で `Connected` | メンションの収集と Issue の作成。背景セッションの中での Issue の参照と返信 |

## 2. 起点

記録の置き場所を作り、今の時刻で起点を書く。これより前に届いた依頼は拾わない。

```bash
mkdir -p ~/.claude/auto-review/briefs
now=$(date +%s)
printf 'slack\t%s.000000\nlinear\t%s\n' "$now" "$(date -u -r "$now" +%Y-%m-%dT%H:%M:%S.000Z)" > ~/.claude/auto-review/cursor.tsv
```

## 3. 定期タスク

Claude Desktop の Code タブで、定期タスク auto-review を次の値で登録する。アプリはプロンプトを `~/.claude/scheduled-tasks/auto-review/SKILL.md` に置く。これはこのリポジトリの [SKILL.md](SKILL.md) と同じファイルなので、プロンプトには SKILL.md の本文をそのまま使う。

| 項目 | 値 |
| :-- | :-- |
| 名前 | `auto-review` |
| 繰り返し | `*/15 10-19 * * 1-5` |
| 権限のモード | `auto`。確認なしで `gh` を読み、背景セッションを始めるため |

## 4. 確かめる

定期タスクを一度手で実行し、報告に「レビュー依頼は 0 件」と出ることを確かめる。依頼が届くと、報告の表にレビューの Issue と背景セッションの `claude attach <id>` が並び、背景セッションが Claude Desktop のサイドバーに出る。背景セッションを開く、再開する、消す操作は、Skill `session-kickoff` の Operations にある。
