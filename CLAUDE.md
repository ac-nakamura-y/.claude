# .agents — 無限実行マルチエージェント構成

このリポジトリは、1 サイクル（worktree 作成 → 実装 → テスト → 動画撮影 → PR 作成）を
直列に何度も繰り返す Claude Code 用のマルチエージェント環境です。

## ディレクトリ

- `scripts/loop.sh` — 1 サイクルを回し続ける無限ループ本体。
- `agents/` — サブエージェント定義（Markdown + YAML フロントマター）。
  - `project-manager.md` — 全体のオーケストレータ
  - `{marketing,design,engineering}-manager.md` — 各部門のマネージャ
  - `marketer-{1,2,3}.md`、`designer-{1,2,3}.md`、`engineer-{1,2,3}.md` — 各ワーカー
- `docs/` — 全エージェントが毎サイクル参照する規約
  - `architecture.md` — レイヤ構成 / 命名規約 / 依存ルール
  - `quality.md` — 型・lint・テスト・E2E のコマンドと品質ゲート
  - `tasks/` — `/plan` スラッシュコマンドで生成される機能別の設計ドキュメント
- `.claude/commands/plan.md` — `/plan <要件>` で呼び出す初期設計コマンド
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

記事 [ralph-loop による完全自律開発ワークフロー](https://note.com/jujunjun110/n/n0903bad8b2f2)
で紹介されたやり方を踏襲しつつ、マイルストーン / 並列タスクの代わりに
「部門マネージャ単位の直列実行」を採用しています。LLM 記憶ではなくファイルに書くのが原則：

- **git**: サイクル毎に `auto/cycle-<timestamp>-NNN` ブランチを切り、独立した worktree で作業。
  コミットはワーカー/マネージャが積み、最後に loop.sh が push して PR を作る。
  **EM フェーズのコミットメッセージは DM / MM への申し送りを兼ねる**（シェル側で情報を渡さない）。
- **CLAUDE.md**: このファイル。全エージェントが読む共通のルールブック。
- **docs/**: レイヤ規約 (`architecture.md`) と品質ゲート (`quality.md`)。
  毎フェーズ冒頭で必ず読ませて、ブレを抑える。
- **ログフォルダ**: `logs/cycle-<timestamp>-NNN/` に plan/各フェーズの出力/動画/PR 原稿を保存。
  次サイクルは前サイクルのログを参照できる（改善の継続性を保つ）。

## 使い方

```bash
# 1) 要件から設計ドキュメントを作る（任意、最初の 1 回だけで OK）
claude
> /plan あなたが作りたいものの要件をここに書く

# 2) 無限ループを開始
scripts/loop.sh

# 3) 停止したくなったら
touch scripts/.stop    # 次サイクルに入る前にグレースフル終了
```

## 新しいサイクルでエージェントが必ず守ること

1. 作業は **その worktree 内だけ** で完結させる。メインリポジトリに直接触らない。
2. 成果物と意思決定メモは **`logs/<cycle>/` 配下**に残す。標準出力だけで終わらせない。
3. 破壊的操作（force push、履歴書き換え、worktree 強制削除）はスクリプト側のみが行う。
4. テスト / 型 / lint が通らない、またはブラウザ/CLI で実際に動かせない場合は
   `logs/<cycle>/FAILED.md` に原因を書いて終了する。モック / ダミーデータで
   「動いているように見せかける」のは禁止（`docs/quality.md`）。
5. 新機能は **縦割りスライス**（Presentation〜Infra を 1 経路通す）で追加する。
   レイヤ横割り（Domain 全部→Repository 全部…）は禁止。
