---
name: slide-editing
description: Rules for editing an existing slide deck (.pptx or Google Slides) without touching the original. Edit a copy of the file, and when changing a slide, duplicate it right after itself, edit the duplicate and hide the original. Use whenever editing, fixing, rewriting or updating slides in an existing deck (「スライドを修正して」「この資料を直して」「◯枚目を変えて」), alongside any other slide skill (brainpad-slides, slide-bp, sabon-teirei-deck, pptx, google-workspace).
---

# Slide Editing

既存のスライド資料を編集するときは、ファイルとスライドの両方で元の姿を残す。利用者が変更前と変更後を見比べられ、いつでも元に戻せるようにするためである。ほかのスライド系スキルで作業するときも、このルールを先に適用する。

## File Copy

スライドを編集する際は必ずファイルをコピーし、そのコピーを編集する。原本には、利用者の明示的な許可があるまで一切手を入れない。編集を終えたら、コピーの場所（パスまたは URL）を利用者に伝える。

形式ごとのコピー方法を以下に示す。

| 形式 | コピーの方法 |
| :-- | :-- |
| .pptx | ファイルを複製し、複製を開いて編集する |
| Google スライド | Google ドライブでファイルをコピーし、コピーを編集する |

## Slide Revision

既存のスライドを改変する際は、元のスライドを複製して `1` 枚後ろに挿入し、複製のほうを編集する。元のスライドは削除せず、非表示にして残す。新しく追加するスライドは元がないため、複製せずにそのまま作る。

```mermaid
flowchart LR
  original[元スライド] --> duplicate[複製挿入]
  duplicate --> edit[複製編集]
  edit --> hide[元を非表示]
```

形式ごとの複製と非表示の方法を以下に示す。

| 形式 | 複製 | 非表示 |
| :-- | :-- | :-- |
| .pptx | スライドを複製し、元のスライドの直後へ移す | スライドの XML（ `<p:sld>` ）に `show="0"` を付ける |
| Google スライド | `duplicateObject` を使う（複製は元の直後に入る） | `updateSlideProperties` で `slideProperties.isSkipped` を `true` にする |
