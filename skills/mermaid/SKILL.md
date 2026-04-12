---
name: mermaid
description: Mermaid記法のルールとガイドライン。ドキュメントやアーキテクチャ設計でMermaid Diagramを記述する際に使用する。Mermaidで図を描く、ダイアグラムを作成する、フローを可視化する等のタスクで適用する。
---

# Mermaid記述ルール

## 命名規則

- 変数名（ID）：camelCaseの英語で記述する。シンプルな単語または単語の組み合わせにする
- 表示名（ラベル）：日本語で記述する。シンプルな表現にする

```mermaid
graph LR
  input["入力"] --> validate(("バリデーション"))
```

## DFD（データフロー図）

外部エンティティとプロセスを以下の記法で区別する。

| 要素 | 記法 | 例 |
|------|------|------|
| 外部エンティティ | `[]` | `user["ユーザー"]` |
| プロセス | `(())` | `validate(("バリデーション"))` |

```mermaid
graph LR
  user["ユーザー"] --> input(("入力"))
  input --> db[("データベース")]
  db --> generateReport(("レポート生成"))
  generateReport --> admin["管理者"]
```
