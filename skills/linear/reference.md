# Reference

Issue 作成時の payload 例、description テンプレート、報告形式を示す。

## Payload

```yaml
title: "タスクタイトル"
team: marutto-ops
project: "<解決したプロジェクト>"
state: Todo
priority: 3
description: |
  ## 背景・目的
  ...

  ## スコープ
  ...

  ## 完了条件
  ...
```

## Override

デフォルト値と上書き条件を次に示す。

| Field | Default | Override |
| :-- | :-- | :-- |
| team | marutto-ops | ユーザー明示時のみ |
| project | [FDE] イニシアチブ配下で自身がメンバーのうち内容に合うもの | ユーザー明示時のみ |
| assignee | null | ユーザー明示時のみ |
| dueDate | null | ユーザー明示時のみ |
| priority | 3 | ユーザー明示時のみ |
| status | Todo | ユーザー明示時のみ。取りかかったら In Progress |
| parentId | なし | 親 Issue が文脈上明らかな場合 |
| labels | null | ユーザー明示時のみ |

## Description Templates

単体タスク向けの description は次の構成とする。

```markdown
## 背景・目的
...

## スコープ
...

## 完了条件
...

## 参考
- <url>
```

マイルストーンや分割タスク向けの description は次の構成とする。

```markdown
## 背景・目的
...

## インプット
- ...

## アウトプット
- ...

## スコープ外
- ...

## 前提
- ...

## 関連Issue
- MRTTOPS-xxxx
```

## Report Format

| Title | Linear | Settings |
| :-- | :-- | :-- |
| タスク名 | [MRTTOPS-xxxx](linear-url) | marutto-ops / [阪急交通社] コスト削減 / Medium / Todo |
