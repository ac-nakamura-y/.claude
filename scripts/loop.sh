#!/usr/bin/env bash
# 無限実行ループ: 1 サイクル = worktree 作成 → 実装 → テスト → 動画撮影 → PR 作成
#
# 使い方:
#   scripts/loop.sh                 # デフォルト設定で延々と回す
#   MAX_CYCLES=3 scripts/loop.sh    # 3 サイクルだけ回す
#   BASE_BRANCH=main scripts/loop.sh
#
# 停止方法:
#   Ctrl+C、または `touch scripts/.stop`（次サイクルに入る前に抜ける）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_ROOT="$ROOT/logs"
WORKTREE_ROOT="$ROOT/.worktrees"
STOP_FILE="$ROOT/scripts/.stop"
BASE_BRANCH="${BASE_BRANCH:-main}"
MAX_CYCLES="${MAX_CYCLES:-0}"            # 0 = 無制限
CYCLE_SLEEP="${CYCLE_SLEEP:-5}"          # サイクル間のインターバル秒
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
PERMISSION_MODE="${PERMISSION_MODE:-acceptEdits}"

mkdir -p "$LOG_ROOT" "$WORKTREE_ROOT"

log() { printf '[loop %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

should_stop() {
  if [[ -f "$STOP_FILE" ]]; then
    log "stop file detected: $STOP_FILE"
    rm -f "$STOP_FILE"
    return 0
  fi
  return 1
}

# 1 フェーズ分の claude 呼び出し。出力は cycle ログへ tee する。
run_phase() {
  local cycle_dir="$1" worktree_dir="$2" agent="$3" prompt="$4"
  local phase_log="$cycle_dir/${agent}.log"

  log "phase=$agent starting (log: $phase_log)"
  (
    cd "$worktree_dir"
    "$CLAUDE_BIN" \
      --agent "$agent" \
      --permission-mode "$PERMISSION_MODE" \
      --append-system-prompt "現在のサイクルログは $cycle_dir です。成果物とメモはそこに保存してください。" \
      -p "$prompt"
  ) 2>&1 | tee "$phase_log"
}

cleanup_worktree() {
  local worktree_dir="$1" branch="$2"
  if [[ -d "$worktree_dir" ]]; then
    git worktree remove --force "$worktree_dir" >/dev/null 2>&1 || true
  fi
  # ブランチはリモートに push 済み。ローカルブランチは残さない。
  git branch -D "$branch" >/dev/null 2>&1 || true
}

cycle=0
while true; do
  cycle=$((cycle + 1))
  if (( MAX_CYCLES > 0 )) && (( cycle > MAX_CYCLES )); then
    log "reached MAX_CYCLES=$MAX_CYCLES, exiting"
    break
  fi
  if should_stop; then break; fi

  ts="$(date +%Y%m%d-%H%M%S)"
  slug="cycle-${ts}-$(printf '%03d' "$cycle")"
  cycle_dir="$LOG_ROOT/$slug"
  worktree_dir="$WORKTREE_ROOT/$slug"
  branch="auto/$slug"

  mkdir -p "$cycle_dir"
  log "=== cycle #$cycle slug=$slug ==="

  # 1. worktree 作成（独立環境）
  git fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true
  git worktree add -b "$branch" "$worktree_dir" "origin/$BASE_BRANCH" \
    2>&1 | tee "$cycle_dir/worktree.log"

  # 失敗時に worktree を必ず掃除する
  trap 'cleanup_worktree "$worktree_dir" "$branch"' EXIT

  # 2. project-manager: 次サイクルの計画を plan.md に書く
  run_phase "$cycle_dir" "$worktree_dir" "project-manager" \
    "$cycle_dir/plan.md を作成してください。
直近の logs/ を参照し、前サイクルの結果を踏まえて
「このサイクルで実装する最小の改善」を 1 つだけ決めて plan.md にまとめてください。
記述は: 目的 / 変更対象ファイル / 受け入れ条件 / 動画で見せるべき操作 の 4 節。"

  if [[ ! -s "$cycle_dir/plan.md" ]]; then
    log "plan.md not produced, aborting cycle"
    echo "PM did not produce plan.md" > "$cycle_dir/FAILED.md"
    cleanup_worktree "$worktree_dir" "$branch"
    trap - EXIT
    continue
  fi

  # 3. engineering-manager: engineer-1/2/3 を使って実装 + テスト
  run_phase "$cycle_dir" "$worktree_dir" "engineering-manager" \
    "$cycle_dir/plan.md の内容を実装してテストを通してください。
engineer-1 / engineer-2 / engineer-3 サブエージェントに役割を割り振り、
完了したら変更を git add && git commit -m 'feat: <要約>' してください。
テストが通らない場合は $cycle_dir/FAILED.md に原因を書いて停止。"

  if [[ -f "$cycle_dir/FAILED.md" ]]; then
    log "engineering failed, skipping to next cycle"
    cleanup_worktree "$worktree_dir" "$branch"
    trap - EXIT
    continue
  fi

  # 4. design-manager: designer-1/2/3 で動画撮影
  run_phase "$cycle_dir" "$worktree_dir" "design-manager" \
    "plan.md の「動画で見せるべき操作」に従って
$cycle_dir/video.mp4 を生成してください。
designer-1 が UI レビュー、designer-2 が撮影、designer-3 がダイジェスト/サムネ作成。
動画が撮れない場合は $cycle_dir/video-notes.md に代替手段（静止画など）を残す。"

  # 5. marketing-manager: marketer-1/2/3 で PR 文面作成
  run_phase "$cycle_dir" "$worktree_dir" "marketing-manager" \
    "$cycle_dir/pr.md を作成してください。
marketer-1 がタイトル / サマリ、marketer-2 がテストプラン、marketer-3 がリリース文。
pr.md の先頭行は「# <PR タイトル>」、その下にサマリ・変更点・テストプランを Markdown で。"

  # 6. push + PR 作成（スクリプト側で実行し、破壊的操作を集約）
  (
    cd "$worktree_dir"
    # engineering フェーズでコミットされているはず。未コミットならスキップ。
    if ! git diff --quiet "origin/$BASE_BRANCH".."HEAD"; then
      local_branch="$(git rev-parse --abbrev-ref HEAD)"
      log "pushing $local_branch"
      for attempt in 1 2 3 4; do
        if git push -u origin "$local_branch"; then
          break
        fi
        sleep $(( attempt * 2 ))
      done

      if command -v gh >/dev/null 2>&1 && [[ -s "$cycle_dir/pr.md" ]]; then
        title="$(head -n 1 "$cycle_dir/pr.md" | sed -E 's/^#+\s*//')"
        body="$(tail -n +2 "$cycle_dir/pr.md")"
        gh pr create --base "$BASE_BRANCH" --head "$local_branch" \
          --title "$title" --body "$body" \
          2>&1 | tee "$cycle_dir/pr-create.log" || true
      else
        log "gh not available or pr.md missing, skipping PR creation"
      fi
    else
      log "no commits vs $BASE_BRANCH, skipping push/PR"
    fi
  )

  # 7. 後片付け
  cleanup_worktree "$worktree_dir" "$branch"
  trap - EXIT

  log "=== cycle #$cycle done ==="
  sleep "$CYCLE_SLEEP"
done
