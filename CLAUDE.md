# .agents — 無限実行マルチエージェント構成

このリポジトリは、1 サイクル（worktree 作成 → 実装 → テスト → 動画撮影 → PR 作成）を
直列に何度も繰り返す Claude Code 用のマルチエージェント環境です。

## ディレクトリ

- `scripts/loop.sh` — 1 サイクルを回し続ける無限ループ本体。
- `agents/` — サブエージェント定義（Markdown + YAML フロントマター）。
  - `project-manager.md` — 全体のオーケストレータ
  - `{marketing,design,engineering}-manager.md` — 各部門のマネージャ
  - `marketer-{1,2,3}.md`、`designer-{1,2,3}.md`、`engineer-{1,2,3}.md` — 各ワーカー
- `logs/cycle-<timestamp>-NNN/` — 1 サイクル分のログ・成果物
  - `plan.md` / `engineering.log` / `design.log` / `marketing.log` / `video.mp4` / `pr.md`
- `.worktrees/cycle-<timestamp>-NNN/` — サイクル毎の git worktree（成功/失敗問わず後片付け）

## エージェント階層（直列に起動）

```
project-manager   # 計画
    ↓
engineering-manager  → engineer-1 / engineer-2 / engineer-3  # 実装 + テスト
    ↓
design-manager       → designer-1 / designer-2 / designer-3  # UI 確認 + 動画撮影
    ↓
marketing-manager    → marketer-1 / marketer-2 / marketer-3  # PR 文面作成
    ↓
loop.sh が git commit / push / PR 作成
```

サブエージェントは他のサブエージェントを生成できない（Claude Code の制約）ため、
各マネージャはそれぞれ独立した `claude --agent <manager>` セッションとして起動します。
PM はサイクルの計画フェーズで走るだけで、実装以降はマネージャが主役になります。

## コンテキスト管理

- **git**: サイクル毎に `auto/cycle-<timestamp>-NNN` ブランチを切り、独立した worktree で作業。
  コミットはワーカー/マネージャが積み、最後に loop.sh が push して PR を作る。
- **CLAUDE.md**: このファイル。全エージェントが読む共通のルールブック。
- **ログフォルダ**: `logs/cycle-<timestamp>-NNN/` に plan/各フェーズの出力/動画/PR 原稿を保存。
  次サイクルは前サイクルのログを参照できる（改善の継続性を保つ）。

## 新しいサイクルでエージェントが必ず守ること

1. 作業は **その worktree 内だけ** で完結させる。メインリポジトリに直接触らない。
2. 成果物と意思決定メモは **`logs/<cycle>/` 配下**に残す。標準出力だけで終わらせない。
3. 破壊的操作（force push、履歴書き換え、worktree 強制削除）はスクリプト側のみが行う。
4. テストが通らない / 動画が撮れない場合は `logs/<cycle>/FAILED.md` に原因を書いて終了する。

## ループの停止方法

- `Ctrl+C` か `touch scripts/.stop` で次サイクルに入る前にループが止まります。
