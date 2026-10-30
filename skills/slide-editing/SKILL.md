---
name: slide-editing
description: Rules for editing an existing slide deck (.pptx or Google Slides) without touching the original. Edit a copy of the file, and when changing a slide, duplicate it right after itself, edit the duplicate and hide the original. Use whenever editing, fixing, rewriting or updating slides in an existing deck (「スライドを修正して」「この資料を直して」「◯枚目を変えて」), alongside any other slide skill (brainpad-slides, slide-bp, sabon-teirei-deck, pptx, google-workspace).
---

# Slide Editing

既存のスライド資料を編集するときの決まりである。原本と元のスライドを残し、何をどう変えたかを利用者があとから見比べられるようにする。ほかのスライド系スキルで作業するときも、このルールを先に適用する。

## Rules

### ファイルはコピーを編集する

スライドを編集する際は必ずファイルをコピーし、そのコピーを編集する。原本には、利用者の明示的な許可があるまで一切手を入れない。

| 形式 | コピーの方法 |
| :-- | :-- |
| .pptx | ファイルを複製し、複製を開いて編集する |
| Google スライド | Google ドライブでファイルをコピーし、コピーを編集する |

作業を終えたら、編集したコピーの場所（パスまたは URL）を利用者に伝える。

### スライドは複製して 1 枚後ろで編集する

既存のスライドを改変する際は、元のスライドを複製して 1 枚後ろに挿入し、複製のほうを編集する。元のスライドは削除せず、非表示にして残す。

```mermaid
flowchart LR
  original[元のスライド] --> duplicate[直後に複製を挿入]
  duplicate --> edit[複製を編集]
  edit --> hide[元のスライドを非表示]
```

| 形式 | 複製 | 非表示 |
| :-- | :-- | :-- |
| .pptx | スライドを複製し、元のスライドの直後へ移す | スライドの XML（ `<p:sld>` ）に `show="0"` を付ける |
| Google スライド | `duplicateObject`（複製は元の直後に入る） | `updateSlideProperties` で `slideProperties.isSkipped` を `true` にする |

新しく追加するスライドには元がないため、そのまま挿入して編集する。
