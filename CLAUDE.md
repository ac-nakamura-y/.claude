# CLAUDE.md

## How to Work

要件を満たすための、本質的かつ必要最小限の作業を実施してください。
すでにある成果物を変更する場合は、すべての要件を俯瞰したうえで構造分解と再構築を実施しましょう。
部分的な追加や修正を施すのではなく、本質的な要件を全体最適に落とし込み、必要最小限の構成で実現します。

## Skills

作業を行う際は、そのタスクに関連する Skill を必ず確認し、適用する。

Skill および Agent 向けの設定資産（Skill、ルール、フック等）は `~/.claude/` 配下で管理する。`~/.cursor/` 配下には新規作成しない。Skill を追加・更新するときは `~/.claude/skills/<skill-name>/SKILL.md` を編集し、必要に応じて同ディレクトリ内に reference ファイルを置く。

| Path | Purpose |
| :-- | :-- |
| `~/.claude/skills/` | ユーザー定義 Skill |
| `~/.claude/CLAUDE.md` | このリポジトリ全体の方針 |

`~/.cursor/skills-cursor/` は Cursor 組み込み Skill のため、ユーザー Skill の配置先としては使わない。
