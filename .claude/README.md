# Trinity — Claude Code 用の3エージェント・ハーネス

Anthropic の Planner / Generator / Evaluator パターンを Claude Code のサブエージェント機能で実装したハーネスである。`/trinity` で起動し、`AskUserQuestion` で要件をヒアリングしてから、隔離された git worktree で実装してコミットし、Evaluator が PASS を返した時点で push と PR 作成まで自動で行う。

## 目次

1. [構成要素](#1-構成要素)
2. [起動から PR までのフロー](#2-起動から-pr-までのフロー)
3. [なぜ3エージェントに分けるのか](#3-なぜ3エージェントに分けるのか)
4. [ディレクトリ構成と worktree 隔離](#4-ディレクトリ構成と-worktree-隔離)
5. [エージェント間の通信契約](#5-エージェント間の通信契約)
6. [モデル割り当て](#6-モデル割り当て)
7. [使い方](#7-使い方)
8. [評価軸（Evaluator）](#8-評価軸evaluator)
9. [設定（settings.json）](#9-設定settingsjson)
10. [拡張・縮退の指針](#10-拡張縮退の指針)
11. [参考資料](#11-参考資料)

## 1. 構成要素

ハーネスは「ユーザーが書く5つの設定ファイル」と「ランタイムで動く5つのアクター」で構成される。

| 区分 | 名前 | 実体 | 責務 |
| --- | --- | --- | --- |
| 設定 | `settings.json` | `.claude/settings.json` | フックと事前承認ツールの定義 |
| 設定 | `/trinity` | `.claude/commands/trinity.md` | オーケストレーターのプロンプト |
| 設定 | `planner.md` | `.claude/agents/planner.md` | Planner のシステムプロンプト |
| 設定 | `generator.md` | `.claude/agents/generator.md` | Generator のシステムプロンプト |
| 設定 | `evaluator.md` | `.claude/agents/evaluator.md` | Evaluator のシステムプロンプト |
| アクター | UserPromptSubmit hook | shell（settings.json） | プリフライト（git 状態の検証） |
| アクター | Orchestrator | Claude（メイン会話） | ヒアリング、run ディレクトリ／worktree 作成、各段の起動、最終化 |
| アクター | Planner | Claude サブエージェント（opus） | `intake.md` → `plan.md` |
| アクター | Generator | Claude サブエージェント（sonnet） | `plan.md` → worktree 内のコード＋コミット |
| アクター | Evaluator | Claude サブエージェント（sonnet） | diff＋`plan.md` → `eval-N.md`、判定 |

Orchestrator は段と段のあいだでコードを自分で読んだり編集したりしない。受け渡しは `RUN_DIR` `WORKTREE_DIR` `BRANCH` のパスとコミット SHA だけにする。各エージェントが成果物（ファイル）から動くという原則がハーネスの本質である。

## 2. 起動から PR までのフロー

```shell
① /trinity [--max-iter=N] [<要件メモ>]
② UserPromptSubmit hook  ── git repo? clean? → BASE_BRANCH 確定
③ Orchestrator: AskUserQuestion でヒアリング → ${RUN_DIR}/intake.md
④ Orchestrator: RUN_DIR / WORKTREE_DIR / BRANCH を作成
⑤ ループ n = 1 .. MAX_ITER
     a. Planner   → ${RUN_DIR}/plan.md
     b. Generator → WORKTREE_DIR で 1 コミット
     c. Evaluator → ${RUN_DIR}/eval-<n>.md と判定
     PASS → 抜ける / NEEDS_REVISION・FAIL → n++
⑥ 最終化（PASS のみ）── push + create_pull_request
⑦ ユーザーへ結果サマリ
```

`/trinity` の引数（要件メモ）は長さも形式も問わない。空でも、長文の仕様書でも構わない。Orchestrator は起動直後に `AskUserQuestion` で必ずヒアリングを行い、確定要件を `intake.md` に書き出してから Planner に渡す。フリーテキストでユーザーに話しかけてはならない。質問は常に `AskUserQuestion` を経由する。

`MAX_ITER` で PASS に至らなかった場合は最終化をスキップし、最新の評価レポートのパスと未解決の指摘だけ出して停止する。黙って繰り返さない。

## 3. なぜ3エージェントに分けるのか

1つのエージェントで計画・実装・評価をまとめてやると、コンテキストが膨らむほどドリフトが起きる。実装の途中で計画が書き換わり、評価者が自分の作品を甘く見て、探索のトークンが実装のトークンを圧迫する。役割を3つのサブエージェントに分け、それぞれに固有のシステムプロンプトと新鮮なコンテキストを与えることで、各段の集中を保ち、評価者の独立した懐疑性を担保する。

Evaluator の独立性は、ファイルベースの通信によって構造的に強制される。Evaluator は計画ファイルと git diff を読み、Generator のチャットコンテキストや内部推論は読まない。これによって「自分の書いたコードに甘くなる」という単一エージェントの典型的な失敗モードが、設計上発生し得なくなる。

## 4. ディレクトリ構成と worktree 隔離

エージェント定義とコマンドは `.claude/` 以下に、ランタイム成果物は `.trinity/` 以下に置く。前者はリポジトリにコミットし、後者は `.gitignore` で除外する。

```shell
.claude/
├── agents/{planner,generator,evaluator}.md
├── commands/trinity.md
└── settings.json

.trinity/                                   # SessionStart hook が用意
├── trinity.log                             # 全 run 共通の時系列ログ
└── <YYYYMMDDTHHMMSSZ>-<slug>/              # 1 run 1 ディレクトリ
    ├── intake.md                           # 起動時ヒアリングで確定した要件
    ├── plan.md                             # Planner（イテレーション間で上書き）
    ├── eval-<n>.md                         # Evaluator（イテレーションごと）
    └── worktree/                           # branch: trinity/<TS>-<slug>
```

`/trinity` は起動時のブランチを `BASE_BRANCH` として記録し、それ以降このブランチには触れない。`BASE_BRANCH` から派生した新しいブランチ `trinity/<TS>-<slug>` を `worktree/` として展開し、Generator はその中だけで読み書きとコミットを行う。これでユーザーの本来のチェックアウトは汚れず、複数 run の並行実行も衝突しない。worktree は監査ログとして残し、不要になったらユーザーが `git worktree remove` で消す。

## 5. エージェント間の通信契約

サブエージェントは互いのチャットコンテキストを見ない。ファイルを介して受け渡す。

| 出力者 | 成果物 | 読む側 |
| --- | --- | --- |
| Orchestrator | `${RUN_DIR}/intake.md` | Planner |
| Planner | `${RUN_DIR}/plan.md` | Generator、Evaluator |
| Generator | `${WORKTREE_DIR}` 内の 1 コミット（SHA） | Evaluator |
| Evaluator | `${RUN_DIR}/eval-<n>.md` | Planner（次イテレーション）、Orchestrator（最終化時） |

`plan.md` `eval-N.md` の中で示す `path:line` は **`WORKTREE_DIR` 起点の相対パス** で書く。Generator/Evaluator は同じ worktree を起点に読むためズレない。PR 本文に貼ったときもレビュアーがリポジトリ相対で読める。

ユーザーへの追加質問は、Orchestrator・Planner ともに **必ず `AskUserQuestion` ツール** を使う。フリーテキストの対話、独自プロンプト、stdin 入力などで代替してはいけない。

## 6. モデル割り当て

| エージェント | モデル | 理由 |
| --- | --- | --- |
| Planner | opus | 漠然とした意図を二値の受け入れ基準に落とす、最も推論負荷の高い段 |
| Generator | sonnet | 仕様が明確な大量作業向き。コスト効率が良い |
| Evaluator | sonnet | 独立した懐疑性は Opus を要さない |

各エージェントの frontmatter にある `model:` で個別に上書きできる。

## 7. 使い方

```shell
/trinity                                                # 引数なし。ヒアリングから始める
/trinity ユーザー設定ページにテーマトグルを追加する        # 短いメモ
/trinity --max-iter=5 認証モジュールを JWT からセッションCookie に移行する
```

引数の長さは問わない。Orchestrator が起動時に `AskUserQuestion` で要件を詰める。`MAX_ITER` の既定値は 15。短いタスクで素早く回すなら `--max-iter=3` のように下げる。

`/trinity` を起動した時点で、ユーザーはパイプライン全体（worktree 作成、ブランチ push、PR 作成）への明示的な許可を出したものとして扱う。途中で確認プロンプトは出さない。

## 8. 評価軸（Evaluator）

記事準拠の4軸を二値で採点する。

- **機能性**：コードが計画どおりに動くか
- **コード品質**：可読性、既存パターンとの整合、不当な `any` の不使用
- **ビジュアル設計**：UI の忠実度とアクセシビリティ。UI 変更がない場合は N/A
- **製品としての厚み**：エッジケース、空・エラー・ローディング状態、計画で指摘された競合状態

すべての指摘は `path:line` で根拠を示す。イテレーション N で出した指摘を N+1 で黙って消すことは禁止する。新しい証拠で「修正済み」を確認するか、未解決として持ち越すかのどちらかである。

判定は3値。

- **PASS**：全受け入れ基準と全軸が PASS
- **NEEDS_REVISION**：FAIL があるが計画は正しく、Generator が直せる範囲
- **FAIL**：計画自体が誤っており、再計画が必要

## 9. 設定（settings.json）

| フック | タイミング | 役割 |
| --- | --- | --- |
| `SessionStart` | セッション開始時 | `.trinity/` と `trinity.log` の用意 |
| `UserPromptSubmit` | プロンプト送信前 | `/trinity` を検出したら git repo＋clean を強制 |
| `SubagentStop` | サブエージェント終了時 | `generator` `evaluator` の終了時刻をログ追記 |
| `PostToolUse` | `Edit`/`Write` 後 | エージェント／コマンド定義の YAML frontmatter 欠損を警告 |

`UserPromptSubmit` がプリフライトの責務を持つことが重要である。Claude ではなくハーネスが実行するので、`/trinity` 起動時に「git リポジトリ内かつ clean」が保証され、プロンプト側で再実装する必要はない。

`permissions.allow` には読み取り専用 git・worktree 操作・型チェック（tsc, mypy）・Lint（eslint, ruff）・テスト（vitest, jest, pytest）が事前承認されている。それ以外は実行時にプロンプトが出る。

## 10. 拡張・縮退の指針

ハーネスの各部品は「モデル単独でできないこと」についての仮定を表している。モデルが進化するにつれて不要になった部品は積極的に削るべきである。

**縮退のシグナル**

- Planner の計画が連続して無修正で通り、Generator からの確認も発生しない → 小タスクでは Planner を抜き、Generator が直接 `intake.md` から動かす
- Evaluator がイテレーション 1 で 90% 以上 PASS を返す → 評価軸が緩いか、Evaluator のコストが見合わない
- イテレーション 2 以降で判定が変わらない → `MAX_ITER` の既定値を下げる

**拡張の判断**

4つ目のエージェント（Planner の前に Researcher、Evaluator の後に Refiner）を足すのは、欠けている能力がボトルネックだと示す証拠が手に入ってからにする。先回りで足すべきものではない。

## 11. 参考資料

- Anthropic「Harness design for long-running apps」 https://www.anthropic.com/engineering/harness-design-long-running-apps
- Qiita「@nogataka 氏の解説記事」 https://qiita.com/nogataka/items/efe8eb9df612d2211221
