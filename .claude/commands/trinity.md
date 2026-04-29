---
description: Planner → Generator → Evaluator のハーネスパイプラインを実行する。使用例 `/trinity <要件>` または `/trinity --max-iter=5 <要件>`。
argument-hint: [--max-iter=N] <1〜4文の要件>
---

# /trinity — 3エージェント・ハーネスパイプライン

ハーネスを取り回すスラッシュコマンドである。Plannerが要件を計画に展開し、Generatorが実装してコミットし、Evaluatorが独立に判定する。判定が PASS になるか、`max_iter` に到達するまで繰り返す。

## 引数

生の引数は `$ARGUMENTS` で受け取る。次の手順で解釈する。

`$ARGUMENTS` の先頭が `--max-iter=N`（N は正の整数）であれば、`MAX_ITER = N` とし、そのトークンを取り除く。先頭が一致しない場合は `MAX_ITER = 15`（既定値）を使う。

残りを「要件」として扱う。要件が空ならユーザーに1〜4文の要件を求めて停止する。先には進めない。

## プリフライトと run ディレクトリ作成

エージェント起動の前に次を行う。

`git status` がクリーンであること。汚れている場合は停止し、ユーザーにコミットまたはスタッシュを依頼する。Evaluatorは各スプリントの差分をクリーンなベースラインから読むため、未コミットのノイズはこの契約を壊す。

現在のブランチが意図したワーキングブランチであること。ブランチの確認はユーザーに表示するが、自動切替はしない。

run ディレクトリを次の手順で作成する。

```shell
TS=$(date -u +%Y%m%dT%H%M%SZ)
SLUG=<要件から生成した2〜5語のkebab-case英字スラッグ>
RUN_DIR=".trinity/${TS}-${SLUG}"
mkdir -p "$RUN_DIR"
printf '=== %s run started ===\n' "${TS}-${SLUG}" >> .trinity/trinity.log
```

スラッグは要件を読んで自分で生成する。日本語要件の場合も2〜5語の英字 kebab-case にする（例: 「ユーザー設定ページにテーマトグルを追加する」→ `add-theme-toggle`）。同一タイムスタンプで衝突した場合は末尾に `-2` `-3` などのサフィックスを付ける。

`$RUN_DIR` の絶対パスをこの後の全段に渡す。

## パイプライン（n = 1 .. MAX_ITER のループ）

### Planner

`planner` サブエージェントを次の入力で起動する。

- 要件（原文ママ）
- `Iteration: <n>`
- `RUN_DIR: <絶対パス>`
- `n > 1` の場合は、直前の評価レポートが `${RUN_DIR}/eval-<n-1>.md` にある旨を伝える

返却された計画ファイルパス（必ず `${RUN_DIR}/plan.md`）を保持する。Plannerが確認のための質問をユーザーに投げた場合は、その内容をユーザーに見せて停止する。

### Generator

`generator` サブエージェントを次の入力で起動する。

- `RUN_DIR: <絶対パス>`
- `Iteration: <n>`

Generator は `${RUN_DIR}/plan.md` を読み、`n > 1` の場合は `${RUN_DIR}/eval-<n-1>.md` も読む。返却された検証レポートとコミットSHAを保持する。Generatorが検証失敗で自力修正もできずコミットを作れなかった場合は、停止して失敗内容をユーザーに報告する。存在しないコミットを Evaluator に渡してはいけない。

### Evaluator

`evaluator` サブエージェントを次の入力で起動する。

- `RUN_DIR: <絶対パス>`
- `Iteration: <n>`
- コミットSHA
- Generatorの検証レポート

返却された評価レポートのパス（必ず `${RUN_DIR}/eval-<n>.md`）と判定（PASS / NEEDS_REVISION / FAIL）を保持する。

### 分岐

PASS の場合は run 終了行をログに書き、コミットSHA・計画パス・評価パスをまとめた1行サマリをユーザーに出力し、ループを抜ける。

```shell
printf '=== %s run ended: PASS ===\n' "${TS}-${SLUG}" >> .trinity/trinity.log
```

NEEDS_REVISION で `n < MAX_ITER` の場合はループを継続する。Plannerは次の周回で評価レポートを受け取り、計画ファイルを新規作成せず上書きする。

FAIL の場合も同じく次の周回に進む。Plannerはより踏み込んだ再計画を行う。

`n == MAX_ITER` で PASS になっていない場合は停止し、最新の評価レポートのパスと未解決の指摘を表示する。終了行をログに書く。

```shell
printf '=== %s run ended: %s at iter %d/%d ===\n' "${TS}-${SLUG}" "${VERDICT}" "$n" "$MAX_ITER" >> .trinity/trinity.log
```

## ユーザーへの出力

ループ終了時に次の形式でちょうど印字する。

```shell
Trinity result: <PASS | NEEDS_REVISION at iter <n> | FAIL at iter <n>>
RunDir:  <RUN_DIR>
Plan:    <RUN_DIR>/plan.md
Commit:  <最後のコミットSHA>
Eval:    <RUN_DIR>/eval-<n>.md
Iters:   <n>/<MAX_ITER>
```

その後に2〜3文の平易な要約を添える。それ以上は書かない。

## オーケストレーター（あなた）への制約

サブエージェントは並列ではなく直列に呼び出す。各段は前段の出力に依存するためである。

段と段のあいだで、コードを自分で読んだり編集したりしない。受け渡しは `RUN_DIR` のパスとコミットSHAだけにする。各エージェントが成果物（ファイル）から動くという原則がハーネスの本質である。

エージェントの出力を要約して次のエージェントに渡さない。`RUN_DIR` を渡し、次のエージェントに自分で読ませる。Evaluatorに必要な独立性はこれで担保される。
