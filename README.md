# personal `~/.claude/` config

このリポジトリは **そのまま `~/.claude/` の中身として動かす** ための個人設定リポジトリである。

## ディレクトリ構成

```shell
.
├── plugins/
│   ├── agent-config/               # git submodule → https://github.com/activecore-org/agent-config
│   │                               #   activecore 社内プラグイン（fde / ops / ac-monitor）
│   ├── trinity/                    # git submodule → https://github.com/yjn279/trinity
│   │                               #   Trinity プラグイン（Planner → Generator → Evaluator）
│   ├── code-review/                # subtree → anthropics/claude-plugins-official plugins/code-review
│   ├── code-simplifier/            # subtree → anthropics/claude-plugins-official plugins/code-simplifier
│   ├── claude-md-management/       # subtree → anthropics/claude-plugins-official plugins/claude-md-management
│   ├── feature-dev/                # subtree → anthropics/claude-plugins-official plugins/feature-dev
│   ├── frontend-design/            # subtree → anthropics/claude-plugins-official plugins/frontend-design
│   ├── plugin-dev/                 # subtree → anthropics/claude-plugins-official plugins/plugin-dev
│   ├── pr-review-toolkit/          # subtree → anthropics/claude-plugins-official plugins/pr-review-toolkit
│   └── ralph-loop/                 # subtree → anthropics/claude-plugins-official plugins/ralph-loop
├── skills/
│   ├── humanizer/                  # git submodule → https://github.com/blader/humanizer
│   ├── frontend-slides/            # git submodule → https://github.com/zarazhangrui/frontend-slides
│   │                               #   ブラウザだけで動くスライドを作る
│   └── documentation/SKILL.md
├── scripts/
│   └── fable-advice/               # 会話が要約されたあと Fable に問いかけを求めるフックの実行ファイル
├── settings.json               # 個人用フックと汎用 dev ツールの permissions
└── README.md
```

## Plugins

`plugins/agent-config` は activecore 社内の Claude Code / Cursor プラグイン群の submodule です。`settings.json` の `extraKnownMarketplaces.activecore` は GitHub の `activecore-org/agent-config` を参照し、`fde` / `ops` / `ac-monitor` を有効化しています。

初回 clone 後は submodule を初期化してください。

```shell
git submodule update --init plugins/agent-config
```

### Claude Code

初回利用時は、マーケットプレイスとプラグインを登録してください。

```shell
/plugin marketplace add activecore-org/agent-config
/plugin install fde@activecore
/plugin install ops@activecore
/plugin install ac-monitor@activecore
/reload-plugins
/fde:notion2linear
```

| プラグイン | スラッシュコマンド例 |
| :-- | :-- |
| fde | `/fde:notion2linear` |
| ac-monitor | `/ac-monitor:triage` |
| ops | （スキル未実装） |

### Cursor

Cursor は `/fde:...` 形式のプラグインコマンドを使えません。`scripts/sync-cursor-plugins.sh` で agent-config の各プラグインを `~/.cursor/plugins/local/` に同期し、Skill は `skills/` の symlink から読み込みます。

```shell
git submodule update --init plugins/agent-config
./scripts/sync-cursor-plugins.sh
# Cursor を再起動、または Developer: Reload Window
```

| プラグイン | Cursor での利用 |
| :-- | :-- |
| fde | Skill `notion2linear`（`skills/notion2linear`）— マーケOps-改善項目の Linear 起票 |
| ac-monitor | Skill `triage-ladder` + プラグイン MCP（CloudWatch）— 定常監視トリアージ |
| ops | プラグイン登録のみ（スキル未実装） |

submodule 更新後は `./scripts/sync-cursor-plugins.sh` を再実行してください。

## ランタイム artifacts

`/trinity:run` は **実行プロジェクトのルート** に `.trinity/<run>/` を作って worktree とログを置く。`~/.claude/` 配下にはランタイム成果物を一切作らない。

## 参考

- Claude Code: Explore the .claude directory — https://code.claude.com/docs/en/claude-directory
- Claude Code: Create plugins — https://code.claude.com/docs/en/plugins.md
- Claude Code: Sub agents — https://code.claude.com/docs/en/sub-agents
