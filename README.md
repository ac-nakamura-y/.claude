# personal `~/.claude/` config

このリポジトリは **そのまま `~/.claude/` の中身として動かす** ための個人設定リポジトリである。エージェント・コマンド・フック・スキル・プラグインを一括管理する。

## 何がここにあるのか

- 「Planner → Generator → Evaluator」のような **複数ファイルにまたがる系** は `plugins/<name>/` に1つのプラグインとして閉じる。リポジトリ自身が一人用 marketplace（`.claude-plugin/marketplace.json`）になっており、新しい系は1ディレクトリ＋1エントリで追加できる
- 個人用の単発 agent / command / skill / hook / 汎用 settings は、リポジトリ直下（`agents/` `commands/` `skills/` `hooks/` `settings.json`）に置く
- `~/.claude/` の中で Claude Code 自身が管理するランタイム領域（`sessions/` `projects/` `plugins/cache/` `todos/` 等）はリポジトリで触らない（`bin/install.sh` は個別パスだけ symlink する）

## ディレクトリ構成

```shell
.
├── .claude-plugin/
│   └── marketplace.json        # 一人用 marketplace（プラグイン目次）
├── plugins/
│   └── trinity/                # 系ごとに1ディレクトリ
│       ├── .claude-plugin/plugin.json
│       ├── agents/             # planner.md, generator.md, evaluator.md
│       ├── commands/run.md     # → /trinity:run
│       ├── hooks/hooks.json    # 系専用フック
│       ├── settings.json       # 系専用 permissions
│       └── README.md
├── agents/                     # 個人用 flat agent（当面は空）
├── commands/                   # 個人用 flat command（当面は空）
├── skills/
│   └── documentation/SKILL.md
├── hooks/                      # 個人用 hook script 置き場（必要時のみ）
├── settings.json               # 個人用フックと汎用 dev ツールの permissions
├── CLAUDE.md                   # personal memory
├── bin/install.sh              # symlink で ~/.claude/ に橋渡しする
├── .gitignore
└── README.md
```

## インストール

```shell
git clone <this-repo> ~/Documents/.claude
cd ~/Documents/.claude
./bin/install.sh
```

`bin/install.sh` は次を行う。冪等で、既存ファイル/ディレクトリは `<name>.bak.<UTC-timestamp>` に退避してから貼る。

1. `agents/` `commands/` `skills/` `hooks/` `CLAUDE.md` を `~/.claude/` 配下に **symlink**（リポジトリ側の編集が直接反映される）
2. `settings.json` は **コピー**（`~/.claude/settings.json` に既存があれば上書きしない）。`claude` CLI が `~/.claude/settings.json` に書き戻す（プラグイン登録、権限自動承認など）ためで、symlink にすると CLI の書き込みがリポジトリに逆流する。リポジトリの `settings.json` を `~/.claude/` に強制反映したいときは `./bin/install.sh --force-settings`
3. このリポジトリを Claude Code の personal marketplace として登録（`claude plugin marketplace add <repo>`）
4. trinity プラグインをインストール（`claude plugin install trinity@yujis-personal`）

`claude` CLI が PATH にない環境ではステップ3と4は手動で行う。

新しい Claude Code セッションを開いて `/trinity:run --max-iter=2 <要件>` で動作確認できる。

## 新しい系を追加する

Trinity と同様の「複数 agent ＋ コマンド＋専用フック」のパッケージを追加するときの手順。

1. `plugins/<name>/` を作る。最低限 `.claude-plugin/plugin.json` と `agents/` か `commands/` のいずれか
2. 専用フックや専用権限が必要なら `plugins/<name>/hooks/hooks.json` と `plugins/<name>/settings.json` に置く（**ルートの `settings.json` には足さない**）
3. `.claude-plugin/marketplace.json` の `plugins` 配列に1エントリ追記
4. `./bin/install.sh` を再実行（既登録の marketplace 更新も冪等）

これでルート直下の `agents/` `commands/` `settings.json` は触らずに済み、系を増やしてもごちゃつかない。

## ランタイム artifacts

`/trinity:run` は **実行プロジェクトのルート** に `.trinity/<run>/` を作って worktree とログを置く。`~/.claude/` 配下にはランタイム成果物を一切作らない。

## 参考

- Claude Code: Explore the .claude directory — https://code.claude.com/docs/en/claude-directory
- Claude Code: Create plugins — https://code.claude.com/docs/en/plugins.md
- Claude Code: Sub agents — https://code.claude.com/docs/en/sub-agents
