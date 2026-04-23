# architecture — 全エージェントが毎サイクル遵守する設計規約

このファイルは PM / マネージャ / ワーカー全員が、各セッションの冒頭で読み込む
「触ってよいファイルを自明化するためのルールブック」です。

プロジェクト固有の実装規約は、このテンプレートを上書きして運用してください。

## レイヤ分け（デフォルトは戦術的 DDD 4 層）

| レイヤ             | ディレクトリ例                          | 依存してよい先        |
| :--------------- | :------------------------------- | :------------- |
| Presentation     | `src/app/`, `src/pages/`         | Application のみ |
| Application      | `src/application/`               | Domain のみ      |
| Domain           | `src/domain/`                    | 何にも依存しない       |
| Infrastructure   | `src/infrastructure/`            | Domain のみ      |

- ドメイン層は外部 SDK / ORM / HTTP クライアントに依存させない。
- アプリケーション層はドメイン層のインターフェース（Repository など）を通じてだけ Infra を呼ぶ。
- UI からドメイン層を直接 import しない。必ず Application を経由。

## 命名規約

- ファイル名は `kebab-case`、シンボルは `PascalCase`（型 / クラス）or `camelCase`（関数 / 変数）。
- ドメインイベントは `<名詞>-<過去分詞>.ts`（例：`order-placed.ts`）。
- リポジトリインターフェースは `I<名詞>Repository`、実装は `<技術><名詞>Repository`。

## 「触るファイルの自明化」ルール

1 タスク = **1 レイヤ内の変更が基本**。レイヤをまたぐときは、他レイヤの影響を最小化するために
Application 層の薄いアダプタだけで済ませる。

- 新機能は **縦割りスライス** で追加する（Presentation〜Infra まで 1 経路だけ通す）。
- レイヤ横断で大量に触る変更はサイクルを割ってから行う。

## 依存管理

- 言語ごとの依存管理コマンド（`pnpm add`, `pip install`, `go get` 等）以外でのパッケージ更新は禁止。
- `package.json` / `requirements.txt` / `go.mod` 等を直接手書きしない（ロックファイル整合性のため）。

## プロジェクト固有の上書き例

> ここから下はプロジェクト毎に書き換える想定のテンプレートです。

```
# このプロジェクトは Next.js 14 App Router + Prisma を採用。
# - Server Component をデフォルトにし、Client Component はイベントが必要な場合だけ。
# - DB 直アクセスは `src/infrastructure/prisma/` 配下に限定する。
```
