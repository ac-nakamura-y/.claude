---
name: slide-editing
description: Rules for editing an existing slide deck (.pptx, including .pptx files on Google Drive, or Google Slides) without touching the original. Edit a copy of the file, and when changing a slide, duplicate it right after itself, edit the duplicate and hide the original. Leave questions for people and values still to fill as yellow sticky notes outside the slide. Use whenever editing, fixing, rewriting or updating slides in an existing deck (「スライドを修正して」「この資料を直して」「◯枚目を変えて」), alongside any other slide skill (brainpad-slides, slide-bp, sabon-teirei-deck, pptx, google-workspace).
---

# Slide Editing

既存のスライド資料を編集するときは、ファイルとスライドの両方で元の姿を残し、まだ決まっていないことは資料の中に付箋で残す。利用者が変更前と変更後を見比べていつでも元に戻せ、資料を開いた人が残りの作業と確認先をその場でつかめるようにするためである。ほかのスライド系スキルで作業するときも、このルールを先に適用する。

## File Copy

スライドを編集する際は必ずファイルをコピーし、そのコピーを編集する。原本には、利用者の明示的な許可があるまで一切手を入れない。編集を終えたら、コピーの場所（パスまたは URL）を利用者に伝える。

形式ごとのコピー方法を以下に示す。

| 形式 | コピーの方法 |
| :-- | :-- |
| .pptx | ファイルを複製し、複製を開いて編集する |
| Google ドライブ上の .pptx | Drive MCP の `copy_file` でコピーを作り、Google Drive for desktop の同期フォルダで編集する |
| Google スライド | Google ドライブでファイルをコピーし、コピーを編集する |

### Google Drive

Google ドライブ上の .pptx は、Google Drive for desktop の同期フォルダで読み書きする。Drive MCP の `download_file_content` は `10` MB を超えるファイルを取得できず、Slides MCP は .pptx を編集できず、ブラウザからのダウンロードは組織のポリシーで止まるためである。

1. Drive MCP の `copy_file` で、原本を作業フォルダ（例：中村作業フォルダ）へコピーする。
2. 同期フォルダでコピーを探す。共有ドライブや共有アイテムは `~/Library/CloudStorage/GoogleDrive-<アカウント>/.shortcut-targets-by-id/<ID>/` の下にある。日本語のファイル名は NFD で保存されるため、 `find -name` は英数字の部分で探す。
3. 手元の作業ディレクトリへ `cp` して編集する。コピーの直後は中身の取得が終わっておらず `0` バイトのことがあるので、サイズを確かめてから使う。
4. 編集した .pptx を同じパスへ `cp` で上書きする。ファイル ID は変わらず、新しい版としてアップロードされる。 `get_file_metadata` でサイズと更新日時が変わったことを確かめる。

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

.pptx の見た目は、確かめたいスライドだけを残した .pptx を `qlmanage -t` で画像にして確かめる。LibreOffice は日本語の文字が抜けるため使わない。

## Sticky Notes

人に確かめることと、後で埋める値は、チャットや別のメモではなく、該当するスライドの枠の外に黄色の付箋として置く。スライドショーや PDF には映らないため、確認が済むまで資料をそのままチーム内で共有でき、開いた人はどのスライドで誰に何を確かめるかを一目でつかめる。

付箋の決まりを以下に示す。

| 項目 | 決まり |
| :-- | :-- |
| 位置 | スライドの上端より上の、ページの外に置く。 `1` 枚に複数あるときは横に並べる |
| 見た目 | 塗り `FFF2CC` 、黒の細い枠線、黒の `9` pt の文字 |
| 1 行目 | 人に確かめることは「■要確認（確認先）」、後で埋める値は「■記入待ち」と書く |
| 2 行目以降 | 確かめることか埋める内容を、いつまでに何を受けて埋めるかとあわせて `1`〜`2` 文で書く |

付箋は、確認が済んで反映したものから消す。先方へ出す前に、塗りが `FFF2CC` の図形が残っていないことを確かめる。
