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

## Repository

このリポジトリは `ac-nakamura-y/.claude` を `origin`（作業用フォーク）とし、`yjn279/.claude` を `upstream`（参照用）として運用する。Pull Request は upstream ではなく、必ずフォーク側の `origin` に対して作成する。

| Remote | Repository | 用途 |
| :-- | :-- | :-- |
| `origin` | `ac-nakamura-y/.claude` | push 先、PR の base |
| `upstream` | `yjn279/.claude` | 参照・同期用（PR 作成先にしない） |

ブランチは `origin` に push し、PR は次の形式でフォーク向けに作成する。

```shell
git push -u origin <branch>
gh pr create --repo ac-nakamura-y/.claude --base main --head <branch>
```

`gh pr create --fill` のみでは upstream 向け PR になる場合があるため、必ず `--repo ac-nakamura-y/.claude` を指定する。

`upstream/main` は GitHub Actions（`.github/workflows/sync-upstream.yml`）で毎週月曜 9:00 JST に `main` へ自動 merge する。手動実行は Actions タブの「Sync upstream/main」から行える。コンフリクト時はワークフローが失敗するため、ローカルで解消して push する。
