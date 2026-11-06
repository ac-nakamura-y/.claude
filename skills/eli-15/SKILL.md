---
name: eli-15
description: Turns information into a systematic, diagram-first HTML explainer that a 15-year-old high school student can follow. Technical terms stay exactly as written and are never defined, since the reader knows them; the words and sentences around them become simpler. Decides what the reader will do after reading, cuts what that task does not need, regroups the rest around the reader's questions, and draws each mechanism as a labeled inline SVG or HTML figure that works in light and dark themes and at phone width. Use when the user asks for a diagram, a visual explanation, or an HTML page that newcomers or students can follow. Not for slides or Markdown documents.
---

# ELI-15

情報を、 15 歳の高校生が読んで分かる HTML の図解にする。専門用語は知っている 15 歳の高校生が、図だけを見て、その図が言う 1 つのことを自分の言葉で言えれば合格とする。構成、図の形、色、書体は題材に合わせてその都度いちばん伝わる形を選ぶ。

## Content

内容は、読み手が読んだあとにすることから決める。

- 専門用語は言い換えず、語の意味も説明しないが、そのものの役割や働きは書く。専門用語とは固有名詞、ツールの画面に出るラベル、チームが呼び名として使う言葉のことで、テーブル名やオプション名のような実装の中だけの名前は含まない。やさしくするのは、用語のまわりの言葉と文の組み立てである。
- 書き始める前に、読み手がこのページを読んだあとに何をするかを 1 つ決め、それに要らないことを外す。残りは要素に分け、資料の順をやめて、読み手が知りたい順に組み直す。
- 入れ子、順番、つながり、比べることのように、言葉だけでは頭の中で組み立てにくい関係は図で見せる。図を先に置き、図が見せていることを文で繰り返さず、見出し・図・数行の文でページが成り立つようにする。ページ全体の文章は少なくし、読み手が数分で読み終える長さを目安にする。
- 資料にあることだけを書き、決まっていないことは決まっていないと書く。

文は Humanizer Skill で自然に整える。

## Figures

図とページのデザインは、 `artifact-design` と `artifact-diagramming` のスキルを読んでから作る。そのうえで、読み手が図だけで仕組みを追え、どの画面でも読めるように、次を守る。

- 図は仕組みを描き、何がどこを通り、どこでつながるかを見せる。矢印には何が起きるかを書き、 1 つの図で言うことは 1 つにする。番号は、本当に順番があるときだけ付ける。
- ER 図やシーケンス図のように決まった記法のある図を求められたら、その図の種類が持つ要素はすべて残し、記法を知らないと読めない記号は使わない。記号が担っていた意味は、記号があった場所に言葉で書く。たとえばカラスの足の代わりに線のそばへ「 1 人が何件も持つ」と書き、戻りを表す破線の矢印の代わりに実線の矢印に「結果を返す」と書く。
- 色は変数で決め、ライトとダークの両方で読めるようにする。スマホの幅でもページが横にはみ出さないようにし、横に長い図は図の枠だけを横にスクロールさせる。
- Artifact として公開しないときは、 doctype から書いた完全な HTML にする。 `artifact-design` の決まりのうち、 doctype や head を書かないことや `data-theme` での切り替えのように公開のしくみに関わるものは、 Artifact のときだけ当てはめる。

## Review

図がすべてできたら、ファイルに書き出し、ブラウザで表示できるときは表示してから、最初から読み通して、なくても図が読める文を削る。次に、全部の図をまとめて 1 回 advisor に助言を求める。 advisor は会話の記録を読むので、呼ぶ前に冒頭の合格の基準を観点として文で書く。用語の説明を足す方向の指摘は受け取らず、もらった指摘で図とまわりの文を直す。
