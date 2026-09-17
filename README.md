# personal `~/.claude/` config

このリポジトリは、そのまま `~/.claude/` の中身として動かす個人設定である。バージョン管理するのは設定・Skill・フックの実行ファイル・社内プラグインの参照だけで、Claude Code が実行時に作るデータは `.gitignore` で除外する。

## Structure

追跡しているファイルの構成を以下に示す。

```shell
.
├── .github/
│   ├── dependabot.yml          # サブモジュールの更新 Pull Request を毎週立てる
│   └── workflows/
│       └── sync-upstream.yml   # upstream/main を毎週月曜 9:00 JST に main へ取り込む
├── plugins/
│   └── agent-config/           # サブモジュール → activecore-org/agent-config
├── skills/                     # Skill 群
├── scripts/
│   ├── fable-advice/           # 会話が要約されたあと Fable に問いかけを求めるフックの実行ファイル
│   └── sync-cursor-plugins.sh  # agent-config の各プラグインを Cursor へ同期する
├── CLAUDE.md                   # すべてのプロジェクトに共通する指示
├── settings.json               # フック・権限・利用するプラグインの宣言
└── README.md
```

## Skills

`skills/` の各ディレクトリが 1 つの Skill に対応する。外部で配布されている Skill はサブモジュールとして取り込み、それ以外はこのリポジトリで直接管理する。

| Skill | 取得元 | 役割 |
| :-- | :-- | :-- |
| `frontend-slides` | zarazhangrui/frontend-slides | ブラウザだけで動くスライドを作る |
| `humanizer` | blader/humanizer | AI が書いたような文章を書き手の言葉へ直す |
| `git-flow` | このリポジトリ | ブランチ・worktree・Pull Request の運用 |
| `imagegen` | このリポジトリ | 画像の生成と編集 |
| `jobcan-expenses` | このリポジトリ | ジョブカンの小口経費精算に通勤費を入力する |
| `linear` | このリポジトリ | Linear Issue の起票 |
| `markdown` | このリポジトリ | Markdown とそれに準じた記法 |
| `notion` | このリポジトリ | Notion ページとデータベースの読み書き |
| `playwright-cli` | このリポジトリ | ブラウザ操作と Web ページのテスト |
| `pr-stats` | このリポジトリ | Pull Request の週次集計 |
| `product-management` | このリポジトリ | 価値提供の指標と、作らずに済ませる判断 |

## Plugins

プラグインは `settings.json` の `enabledPlugins` と `extraKnownMarketplaces` で宣言し、実体は Claude Code が `plugins/` へ取得する。例外は activecore 社内のプラグイン群 `agent-config` で、こちらはサブモジュールとして追跡し、初回 clone 後に初期化する。

```shell
git submodule update --init plugins/agent-config
```

### Claude Code

`fde` / `ops` / `ac-monitor` の 3 つを利用する。初回はマーケットプレイスとプラグインを登録する。

```shell
/plugin marketplace add activecore-org/agent-config
/plugin install fde@activecore
/plugin install ops@activecore
/plugin install ac-monitor@activecore
/reload-plugins
```

| プラグイン | スラッシュコマンド |
| :-- | :-- |
| `fde` | `/fde:notion2linear` |
| `ac-monitor` | `/ac-monitor:triage` |
| `ops` | なし（スキル未実装） |

### Cursor

Cursor は `/fde:...` 形式のプラグインコマンドを扱えないため、`scripts/sync-cursor-plugins.sh` で MCP・commands・hooks を `~/.cursor/plugins/local/` へ同期する。Skill は `~/.claude/plugins/cache` 経由で 1 箇所だけ読み込む。サブモジュールを更新したあとは再実行する。

```shell
./scripts/sync-cursor-plugins.sh
# Cursor を再起動、または Developer: Reload Window
```

| プラグイン | Cursor での利用 |
| :-- | :-- |
| `fde` | Skill `notion2linear` — マーケOps-改善項目の Linear 起票 |
| `ac-monitor` | Skill `triage-ladder` と CloudWatch MCP — 定常監視のトリアージ |
| `ops` | プラグイン登録のみ（スキル未実装） |

## Runtime

`/trinity:run` は実行するプロジェクトのルートに `.trinity/<run>/` を作り、worktree とログをそこへ置く。`~/.claude/` 配下には実行時の成果物を作らない。

## References

- Claude Code: Explore the .claude directory — https://code.claude.com/docs/en/claude-directory
- Claude Code: Create plugins — https://code.claude.com/docs/en/plugins.md
- Claude Code: Sub agents — https://code.claude.com/docs/en/sub-agents
