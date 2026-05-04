# personal `~/.claude/` config

このリポジトリは **そのまま `~/.claude/` の中身として動かす** ための個人設定リポジトリである。

## ディレクトリ構成

```shell
.
├── trinity/                    # Trinity プラグイン（Planner → Generator → Evaluator）
│   ├── .claude-plugin/plugin.json
│   ├── agents/                 # planner.md, generator.md, evaluator.md
│   ├── commands/run.md         # → /trinity:run
│   ├── hooks/hooks.json
│   ├── settings.json
│   └── README.md
├── skills/
│   └── documentation/SKILL.md
├── settings.json               # 個人用フックと汎用 dev ツールの permissions
└── README.md
```

## ランタイム artifacts

`/trinity:run` は **実行プロジェクトのルート** に `.trinity/<run>/` を作って worktree とログを置く。`~/.claude/` 配下にはランタイム成果物を一切作らない。

## 参考

- Claude Code: Explore the .claude directory — https://code.claude.com/docs/en/claude-directory
- Claude Code: Create plugins — https://code.claude.com/docs/en/plugins.md
- Claude Code: Sub agents — https://code.claude.com/docs/en/sub-agents
