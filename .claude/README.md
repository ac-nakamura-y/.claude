# Trinity — Claude Code 用の3エージェント・ハーネス

長時間タスク向けに、Anthropic の Planner / Generator / Evaluator パターンを Claude Code のサブエージェントで実装したハーネスである。`/trinity <要件>` で起動する。

## 参考資料

設計の出典は次の2つである。

- Anthropic「Harness design for long-running apps」 https://www.anthropic.com/engineering/harness-design-long-running-apps
- Qiita「@nogataka 氏の解説記事」 https://qiita.com/nogataka/items/efe8eb9df612d2211221

## 3エージェントに分ける理由

1つのエージェントで計画・実装・評価をまとめてやると、コンテキストが膨らむほどドリフトが起きる。実装の途中で計画が書き換わり、評価者が自分の作品を甘く見て、探索のトークンが実装のトークンを圧迫する。役割を3つのサブエージェントに分け、それぞれに固有のシステムプロンプトと新鮮なコンテキストを与えることで、各段の集中を保ち、評価者の独立した懐疑性を担保する。

## ファイル構成

ハーネスはリポジトリ直下の `.claude/` 以下に閉じている。

```shell
.claude/
├── agents/
│   ├── planner.md      # opus  · 要件 → 計画ファイル
│   ├── generator.md    # sonnet · 計画 → コード＋コミット
│   └── evaluator.md    # sonnet · 差分＋計画 → 判定
├── commands/
│   └── trinity.md      # /trinity オーケストレーター
├── trinity/            # 計画ファイル＋イテレーションごとの評価レポート（実行時生成）
└── settings.json       # フックと許可リスト
```

## ファイルベースで通信する

サブエージェントは互いのチャットコンテキストを見ない。ファイルを介して受け渡しを行う。

| 出力者 | ファイル | 入力者 |
| --- | --- | --- |
| Planner | `.claude/trinity/<YYYYMMDD-HHMM>-<slug>.md` | Generator、Evaluator |
| Generator | gitコミット1つ（SHAをオーケストレーターが渡す） | Evaluator |
| Evaluator | `.claude/trinity/<plan-stem>.eval-<n>.md` | Planner（次のイテレーション） |

これがEvaluatorの独立性の仕掛けである。Evaluatorは計画と差分を読み、Generatorの推論過程は読まない。

## モデルの割り当て（記事推奨）

軸となる配分は次のとおりである。

| エージェント | モデル | 理由 |
| --- | --- | --- |
| Planner | opus | 漠然とした意図を二値の受け入れ基準に落とす、最も推論負荷の高い段 |
| Generator | sonnet | 仕様が明確な大量作業向き。コスト効率が良い |
| Evaluator | sonnet | 独立した懐疑性は Opus を要さない。Sonnet で十分かつ低コスト |

各エージェントの frontmatter にある `model:` で個別に上書きできる。

## 使い方

代表的な呼び出しは次のとおりである。

```shell
/trinity ユーザー設定ページにテーマトグルを追加する。
/trinity --max-iter=5 認証モジュールを JWT からセッションCookie に移行する。
```

`MAX_ITER` の既定値は 15 である。短いタスクで素早く回したいときは `--max-iter=3` のように下げる。長時間で品質を追い込みたいタスクほど既定値が活きる構成になっている。

### プリフライトの契約

ワーキングツリーがクリーンであること。Evaluatorは各スプリントを単一のコミットとして読むため、未コミットのノイズが混じるとこの契約が壊れる。

ブランチはユーザーが起動した時点のものを維持する。ハーネスはブランチを切り替えたり、新たに作ったりしない。

### 実行ループ

ループの全体像は次のとおりである。

```shell
            ┌─────────────────────────────────────────┐
            ▼                                         │
  Planner ──▶ plan.md ──▶ Generator ──▶ commit ──▶ Evaluator
                                                      │
                                              PASS ───┘ exit
                                              NEEDS_REVISION / FAIL
                                                      │
                                                      └──▶ next iter
```

判定が PASS になればループを抜ける。`MAX_ITER` に到達しても PASS にならない場合は停止し、最新の評価レポートのパスを表示する。黙って延々と繰り返さない。

## 評価軸（Evaluator）

記事準拠の4軸を二値で採点する。

機能性は、コードが計画どおりに動くかを問う。コード品質は、可読性・既存パターンとの整合・不当な `any` の不使用を問う。ビジュアル設計は、UIの忠実度とアクセシビリティを問い、UI変更がない場合はN/Aとする。製品としての厚みは、エッジケース、空・エラー・ローディング状態、計画で指摘された競合状態を問う。

すべての指摘は `path:line` で根拠を示す。イテレーション N で出した指摘を N+1 で黙って消すことは禁止する。新しい証拠で「修正済み」を確認するか、未解決として持ち越すかのどちらかである。

## フック（settings.json）

設定済みのフックは3種類ある。

SessionStart は `.claude/trinity/` の存在と `.trinity.log` の用意を保証する。SubagentStop は `generator` と `evaluator` の終了時刻を `.claude/trinity/.trinity.log` に追記する。コスト監査と振り返りに使える。PostToolUse は `Edit|Write` を監視し、エージェントやコマンドのファイルを編集した際に YAML frontmatter の区切りが欠けていないかを警告する。これらのファイルが静かに壊れるのを防ぐ。

## Generator が呼べるツール

事前承認された許可リストには、読み取り専用の git（`status`、`log`、`diff`、`show`、`rev-parse`）、型チェック（`tsc --noEmit`、`mypy`）、Lint（`eslint`、`ruff`）、テスト（`vitest run`、`jest`、`pytest`）が含まれている。UIスモークの Playwright MCP は別途設定する。

それ以外は実行時にプロンプトが出る。これは意図的である。破壊的なコマンドや珍しいコマンドは明示的な承認を必要とすべきだからである。

## ハーネスを増やすか減らすかの判断

記事の主張の核は次の点である。ハーネスの各部品は、モデル単独でできないことについての仮定を表している。モデルが進化するにつれ、不要になった部品は積極的に削るべきである。

具体的な削減シグナルとしては、Plannerの計画が連続して無修正で通り、Generatorからの確認も発生しなくなったら、小さなタスクではPlannerを抜いてGeneratorが直接ユーザー要件から動くことを検討する。Evaluator がイテレーション1で90%以上 PASS を返すようになったら、評価軸が緩いか、Evaluator自体が定常作業ではコストに見合わなくなっている。イテレーション2以降で判定が変わらないなら、`MAX_ITER` の既定値を下げる。

逆に4つ目のエージェント（Plannerの前に Researcher、Evaluatorの後に Refiner）を足すのは、欠けている能力がボトルネックだと示す証拠が手に入ってからにする。先回りで足すべきものではない。
