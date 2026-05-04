# ~/.claude — personal Claude Code config

このリポジトリは `~/.claude/` の中身そのものとして使う。`bin/install.sh` が必要なディレクトリを `~/.claude/` に symlink する。

## レイアウト方針

- `skills/` `CLAUDE.md` はリポジトリ直下に置き、`bin/install.sh` で `~/.claude/` 配下に symlink する。リポジトリ側の編集が直接 `~/.claude/` に反映される
- `settings.json` だけは **コピー方式**（CLI が `~/.claude/settings.json` に書き戻すため、symlink するとリポジトリに逆流する）。`./bin/install.sh --force-settings` でリポジトリ版を `~/.claude/` に強制反映できる
- 「Planner→Generator→Evaluator」のような複数ファイルにまたがるエージェント・フローは **plugin として `<name>/` をリポジトリ直下に置き**、`.claude-plugin/marketplace.json` の `source` でそこを指す。コマンドや agent は `/<plugin>:<command>` `<plugin>:<agent>` の形で自動 namespace 化される
- リポジトリ自身が一人用 marketplace（`.claude-plugin/marketplace.json`）。新しい系を増やすときはリポジトリ直下に `<name>/` を追加して `marketplace.json` の `plugins` 配列に1エントリ足す
- runtime（`.trinity/<run>/` など）は実行プロジェクトのルートに作る。`~/.claude/` には作らない

## やってはいけないこと

- `~/.claude/sessions/` `~/.claude/projects/` `~/.claude/plugins/cache/` `~/.claude/todos/` などは Claude Code 自身が管理する領域。リポジトリで上書きしない
- `bin/install.sh` 以外の手段で `~/.claude/` 配下のファイルを書き換えない（次回の install で予期せず上書きされる）

## 系を追加するとき

1. リポジトリ直下に `<name>/` を作る。最低限 `.claude-plugin/plugin.json` と `agents/` か `commands/` のいずれか
2. フックや専用の権限が必要なら `<name>/hooks/hooks.json` と `<name>/settings.json` を plugin 配下に置く（ルートの `settings.json` には足さない）
3. `.claude-plugin/marketplace.json` の `plugins` 配列に1行追加（`source: ./<name>`）
4. `bin/install.sh` を再実行（既登録 marketplace の更新は冪等）
