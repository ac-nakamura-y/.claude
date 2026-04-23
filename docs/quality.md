# quality — ハーネス（自動検証）コマンドと品質ゲート

Builder / Verifier 相当のエージェント（engineer-3, engineering-manager, designer-1）は
コミット前に **以下のコマンドがすべて成功する** ことを確認してください。

失敗したまま commit / push しないこと。失敗した内容は `<cycle_dir>/FAILED.md` に書いて停止する。

## 実行順

1. 型チェック
2. lint
3. ユニットテスト
4. 依存関係チェック（該当プロジェクトのみ）
5. E2E / 画面操作確認（design-manager フェーズで実施）

## コマンド（プロジェクト毎に書き換える）

```bash
# 型チェック
pnpm typecheck         # or: tsc --noEmit / mypy / go vet

# lint
pnpm lint              # or: ruff / eslint / golangci-lint

# ユニットテスト
pnpm test              # or: pytest -q / go test ./...

# 依存方向チェック（DDD レイヤ違反の検出）
pnpm depcruise         # or: dependency-cruiser / import-linter
```

## 完了条件（マイルストーンなしでもサイクル毎に適用）

記事のエッセンスをサイクル粒度に移植したルール：

- [ ] 上記 4 コマンドがローカルで成功する
- [ ] **ブラウザ（または CLI 等、プロダクトの主要インターフェース）で
      実際に操作できる** ことを動画 / スクリーンショットで確認できる
- [ ] モックやスタブで「動いているように見せかける」状態にしない

## モック禁止ルール

> LLM の悪癖：試行錯誤してうまくいかないと、モックやスタブでごまかして完了扱いにすることがある。

- テストでのモックは許容（外部 API 等の避けられない箇所のみ）。
- しかし **production コード内でのハードコード / ダミーデータの残置は禁止**。
- DB / API / ファイル IO は本物のインフラに接続できる状態で完了にする。
  接続できない場合は `FAILED.md` に書いて止める。
