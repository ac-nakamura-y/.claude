---
name: bpmn
description: Writes, reviews, lints, and renders business process flows (業務フロー) as BPMN 2.0 XML .bpmn files with the bpmn.io toolchain (bpmn-js, bpmnlint, bpmn-to-image). Use whenever the user wants to draw, create, fix, or review a 業務フロー or business process diagram, opens or edits a .bpmn file, asks to set up bpmnlint or bpmn-to-image, or wants to move flows out of draw.io, Excel, or PowerPoint into a format AI can read, even if they never say "BPMN".
---

# BPMN

業務フローを BPMN 2.0 XML の `.bpmn` ファイルとして記述し、 bpmn.io のツール群で検査・レビュー・画像化する。 `.bpmn` は業務の意味を要素の型（ `bpmn:userTask` など）と要素間の参照として持つため、図形の座標やスタイルから意味を推測せずに読み書きできる。

## Workflow

作業は規約の確認、モデリング、静的解析、レビュー、画像化の順に進める。構造の誤りは静的解析で機械的に取り除き、業務の意味に関わる誤りをレビューで扱う。既存フローのレビューだけを頼まれた場合は、静的解析とレビューのみを行う。ツールの実行に失敗しても、その段階を省かずにエラーをそのままユーザーへ伝える。

```mermaid
flowchart LR
  guideline[規約確認] --> modeling[モデリング]
  modeling --> lint[静的解析]
  lint --> review[レビュー]
  review --> render[画像化]
```

## Guideline

記述規約は [references/guideline.md](references/guideline.md) に定める。記法のレベル、タスクの粒度、記述ルール、レイアウトを扱い、各ルールに出典（BPMN 仕様の条番号、 BPMN Method and Style、機能階層、独自）を添えている。

対象のプロジェクトに `.claude/rules/bpmn.md` などの規約があれば、そちらを優先する。規約のないプロジェクトに導入する場合は、 guideline.md を `.claude/rules/bpmn.md` へ複製し、 Front Matter の `paths` を `.bpmn` の置き場所に合わせる。

## File Structure

`.bpmn` は業務の意味を表す部分と、図の配置を表す部分に分かれる。 bpmn.io は配置の情報を持たない要素を描画しないため、要素を書くときは両方をそろえる。

| 接頭辞 | 役割 | 主な要素 |
| :-- | :-- | :-- |
| `bpmn` | 業務の意味 | `collaboration` , `process` , `laneSet` , `userTask` , `exclusiveGateway` , `sequenceFlow` |
| `bpmndi` | 図の配置 | `BPMNDiagram` , `BPMNShape` , `BPMNEdge` , `BPMNLabel` |
| `dc` | 位置と大きさ | `Bounds` |
| `di` | 線の折れ点 | `waypoint` |

ルート要素では4つの名前空間を宣言する。レーンを持つプールは `collaboration` 内の `participant` で表して `processRef` でプロセスを指し、図の `BPMNPlane` は `collaboration` を指す。

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="備品の購入申請" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">（レーン、要素、シーケンスフロー）</bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">（図形と線）</bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

業務の意味の部分は次のように書く。 ID は `Task_Register` や `Event_RequestSent` のように種別と内容が分かる英語にし、名前の途中の改行は `&#10;` で入れる。

```xml
<bpmn:userTask id="Task_Register" name="購入申請を&#10;登録">
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_2</bpmn:outgoing>
</bpmn:userTask>
<bpmn:intermediateThrowEvent id="Event_RequestSent" name="申請通知送信">
  <bpmn:incoming>Flow_2</bpmn:incoming>
  <bpmn:outgoing>Flow_3</bpmn:outgoing>
  <bpmn:messageEventDefinition id="MessageEventDefinition_1" />
</bpmn:intermediateThrowEvent>
<bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Register" targetRef="Event_RequestSent" />
```

BPMN はメッセージフローを異なるプールの間にしか認めないため、同じプールのレーン間で通知を送る場合は、送る側のスローイベントと受け取る側のキャッチイベントをシーケンスフローでつないで表す。通知を伴わずに作業が次の担当者へ移る場合は、シーケンスフローがそのままレーンをまたいでよい。

## Diagram Layout

配置は bpmn.io の既定の大きさに合わせ、座標はプールの起点からの絶対値で書く。要素はレーンの縦中央に置き、レーンの高さや要素の間隔は規約のレイアウトに従う。

| 対象 | 幅 × 高さ | 配置 |
| :-- | :-- | :-- |
| プール | 規約の横幅 × レーンの合計 | `isHorizontal="true"` を付ける。左端の幅 `30` はプール名の帯になる |
| レーン | プール幅 − `30` × 規約の高さ | `isHorizontal="true"` を付ける。 x は `30` 、 y は上のレーンの下端から積む |
| タスク | `100` × `80` | y はレーン上端 + `20` |
| イベント | `36` × `36` | y はレーン上端 + `42` 。ラベルは `BPMNLabel` で図形の上か下に置く |
| ゲートウェイ | `50` × `50` | y はレーン上端 + `35` 。 `isMarkerVisible="true"` を付ける |
| シーケンスフロー | なし | `di:waypoint` で出発する図形の辺から到着する図形の辺までを結ぶ |

要素を追加・削除するときは、次の5か所をそろえて更新する。

| 更新箇所 | 内容 |
| :-- | :-- |
| 要素 | 自身と前後の要素の `incoming` と `outgoing` にフロー ID を書く |
| レーン | 所属するレーンの `flowNodeRef` に要素 ID を加える |
| シーケンスフロー | `sourceRef` と `targetRef` で前後の要素をつなぐ |
| 図形 | `BPMNShape` の `bpmnElement` に要素 ID を指定する |
| 線 | `BPMNEdge` と `di:waypoint` を加える |

## Lint

`.bpmn` を書いたら bpmnlint で検査し、エラーが `0` 件になるまで直す。 bpmnlint は実行したディレクトリの `.bpmnlintrc` を読むため、リポジトリのルートなど設定のある場所で実行する。設定がなければ、推奨ルールを継承する `.bpmnlintrc` を作る。

```json
{
  "extends": "bpmnlint:recommended"
}
```

```bash
npx bpmnlint path/to/file.bpmn
```

推奨ルールは、開始イベントと終了イベントの有無、ラベルの欠落、どこにもつながらない要素、配置の情報の欠落（ `no-bpmndi` ）などを検査する。結果は要素 ID とルール名の組で出るため、要素 ID から該当箇所を探して直す。

## Review

bpmnlint は構造だけを見るため、業務の意味に関わる誤りは規約に照らしたレビューで見つける。読むのは業務の意味の部分だけでよく、配置の座標は読み飛ばす。 bpmnlint を通過してしまう代表的な誤りを以下に示す。

- 送受信の取り違え：ラベルが「〜送信」なのにキャッチイベントになっている
- 分岐の入れ違え：承認の YES が却下通知へ、 NO が発注へ進んでいる
- レーン名の揺れ：同じ担当者を指すレーン名がフローごとに異なる
- 空のレーン：要素を1つも持たないレーンがある

指摘は次の形式で返す。出典を添えると、指摘の根拠を BPMN 仕様の条番号やスタイルルールとして示せる。

| 要素 ID | 指摘 | ルール | 出典 |
| :-- | :-- | :-- | :-- |
| `Event_RequestSent` | 送信のラベルだがキャッチイベントになっている | 送る側はスローイベントで描く | BPMN §10.5.4 |

修正も求められたら `.bpmn` を直接編集し、 bpmnlint を再実行する。 DFD など他の成果物との照合を求められたら、データの受け渡しをメッセージイベントとタスクの単位で突き合わせる。

## Rendering

`.bpmn` は bpmn.io のエディタがないと図として見えないため、画像に変換して `.bpmn` の隣に置き、 Markdown から参照できるようにする。 bpmn-to-image は Puppeteer で Chrome を起動して描画する。 Puppeteer 用の Chrome が導入されていないと起動に失敗するため、 `PUPPETEER_EXECUTABLE_PATH` でインストール済みの Chrome を指定する。次の例のパスは macOS のものである。

```bash
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx bpmn-to-image --no-footer path/to/file.bpmn:path/to/file.svg
```

出力形式は出力先の拡張子（ `.svg` 、 `.png` 、 `.pdf` ）で決まり、 `入力:出力` の組を空白区切りで並べると複数を一度に変換できる。主なオプションは次のとおり。

| オプション | 効果 |
| :-- | :-- |
| `--no-footer` | bpmn.io のロゴとタイトルを消す |
| `--min-dimensions=1123x794` | 最小サイズを指定する。 PNG と PDF にのみ効く |

変換後は画像を開き、要素やラベルが重なっていないかを確かめる。座標の重なりは bpmnlint でも変換でもエラーにならない。

## References

参照先を以下に示す。

| 名前 | URL |
| :-- | :-- |
| BPMN 2.0.2 仕様 | https://www.omg.org/spec/BPMN/2.0.2/ |
| bpmn.io | https://bpmn.io/ |
| bpmnlint | https://github.com/bpmn-io/bpmnlint |
| bpmn-to-image | https://github.com/bpmn-io/bpmn-to-image |
| BPM-J 機能階層 | https://www.bpm-j.org/download/bpmmodel.pdf |
| bpmn.io で始める AI-Ready な業務フロー管理 | https://future-architect.github.io/articles/20261009a/ |
