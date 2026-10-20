---
name: eli-15
description: Turns information into a systematic, diagram-first HTML explainer that a 15-year-old high school student can follow. Technical terms stay exactly as written and are never defined, since the reader knows them; the words and sentences around them become simpler. Decides what the reader will do after reading, cuts what that task does not need, regroups the rest around the reader's questions, and draws each mechanism as a labeled inline SVG or HTML figure that works in light and dark themes and at phone width. Use when the user asks for a diagram, a visual explanation, or an HTML page that newcomers or students can follow. Not for slides or Markdown documents.
---

# ELI-15

情報を、 15 歳の高校生が読んで分かる HTML の図解にする。決まりは内容と図の 2 つだけで、構成・図の形・デザインは題材と読み手に合わせてその都度いちばん伝わる形を選ぶ。

## Content

内容については次の 4 つを守る。

- 読み手は 15 歳の高校生で、専門用語は知っている前提とする。用語は言い換えず、語の意味も説明しないが、そのものの役割や働きは書く。専門用語とは固有名詞、ツールの画面に出るラベル、チームが呼び名として使っている言葉のことで、テーブル名やオプション名のような実装の中だけの名前は含まない。やさしくするのは、用語のまわりの言葉と文の組み立てである。
- 書き始める前に、読み手がこのページを読んだあとに何をするかを 1 つ決め、それに要らないことを外す。残りは要素に分け、資料の順をやめて、読み手が知りたい順に組み直す。
- 入れ子、順番、つながり、比べることのように、言葉だけでは頭の中で組み立てにくい関係は図で見せる。図を先に置き、文はその図を読むのに要ることだけにする。
- 資料にあることだけを書き、決まっていないことは決まっていないと書く。

文は Humanizer Skill で自然に整える。

## Figures

図とページのデザインは、 `artifact-design` と `artifact-diagramming` のスキルを読んでから作る。特に次の点を押さえる。

- 図は仕組みを描き、何がどこを通り、どこでつながるかを見せる。矢印には何が起きるかを書き、 1 つの図で言うことは 1 つにする。
- 構成、色、書体、図の形は題材から決める。番号は、本当に順番があるときだけ付ける。
- 色は変数で決め、ライトとダークの両方で読めるようにする。スマホの幅でもページが横にはみ出さないようにし、横に長い図は図の枠だけを横にスクロールさせる。
- Artifact として公開しないときは、 doctype から書いた完全な HTML にする。 `artifact-design` の決まりのうち、 doctype や head を書かないことや `data-theme` での切り替えのように公開のしくみに関わるものは、 Artifact のときだけ当てはめる。
