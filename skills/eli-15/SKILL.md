---
name: eli-15
description: Turns any information into a systematic, diagram-first HTML explainer that a 15-year-old high school student can follow. Keeps technical terms exactly as written and assumes the reader already knows them, while making everything else easier, from everyday words and short sentences to the order of ideas. Breaks the source into elements, regroups them around the questions a reader would ask, and draws the mechanism (nesting, sequence, connection, comparison) as labeled inline SVG or HTML figures that read well in light and dark themes and at phone width. Use whenever the user asks for 図解, 図で説明して, HTML でまとめて, 体系的に整理して, しくみを説明して, eli-15, or a page 新人・インターン・高校生でも分かる. Not for slide decks or Markdown documents.
---

# ELI-15

情報を、 15 歳の高校生が読んで分かる HTML の図解にする。

## Essentials

守るのは次の 4 つだけで、構成・図の形・デザインは、題材と読み手に合わせてその都度いちばん伝わる形を選ぶ。

- 読み手：15 歳の高校生。専門用語は知っている前提で、言い換えず、語の意味も説明しない。ただし、そのものの役割や働きは書く。専門用語とは、固有名詞、ツールの画面に出るラベル、チームが呼び名として使っている言葉のことで、実装の中だけの名前（テーブル名やオプション名など）は含まない。やさしくするのは、用語以外の言葉と文の組み立てである。
- 体系：まず、読み手がこのページを読んだあとに何をするかを 1 つ決め、それに要らないことは外す。残りを要素に分け、資料の順ではなく、読み手が知りたい順にまとめ直す。
- 図解：言葉だけでは頭の中で組み立てにくい関係（入れ子、順番、つながり、比べること）を図で見せる。図を先に置き、文はその図を読むのに要ることだけにする。
- 事実：資料にあることだけを書き、決まっていないことは決まっていないと書く。

## Design

図とデザインは、 `artifact-design` と `artifact-diagramming` のスキルを読んでから書く。要点を次に示す。

- 図は仕組みを描く。箱に名前を置くだけにせず、何がどこを通り、どこでつながるかを見せ、矢印には何が起きるかを書く。 1 つの図で言うことは 1 つにする。
- 構成・色・書体・図の形は題材から決め、決まった型に当てはめない。番号は、本当に順番があるときだけ付ける。
- 色は変数で決め、ライトとダークの両方で読めるようにする。スマホの幅でもページが横にはみ出さないようにする。横に長い図は、図の枠だけを横にスクロールさせてよい。
- Artifact として公開しないときは、 doctype から書いた完全な HTML にする。 `artifact-design` のうち、公開のしくみに関わる決まり（ doctype や head を書かない、 `data-theme` で切り替えるなど）は Artifact のときだけ当てはめる。

文は Humanizer Skill で自然に整える。
