#!/usr/bin/env node
// Auto Review が始めたレビューのセッションのうち、レビューの Issue を Done にして入力待ちのものを claude rm で閉じる。
// worktree とそのブランチも一緒に消える。定期タスク Auto Review が毎回の実行で呼ぶ。
// 閉じたものと閉じられなかったものを、id、名前、結果のタブ区切りで 1 行ずつ出す。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Auto Review の SKILL.md が決めるセッションの名前の末尾。どちらかを変えるときは両方をそろえる。
const NAME_SUFFIX = " のレビュー";
const DONE = "Done";

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
const JOBS = path.join(CLAUDE_HOME, "jobs");
const LOG = path.join(CLAUDE_HOME, "auto-review", "close.log");

const log = (line) => {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
};

// 会話の記録に、レビューの Issue を Done にした呼び出しの成功があるか。
// 書き込みの最後の手順が Done なので、判定や依頼の場所によらず、これを書き込みを終えた印とする。
function done(transcriptPath) {
  const contents = fs
    .readFileSync(transcriptPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => JSON.parse(line).message?.content)
    .filter((content) => typeof content === "object" && content !== null);
  const doneCalls = new Set(
    contents
      .filter((c) => c.type === "tool_use" && c.name?.endsWith("save_issue") && c.input?.state === DONE)
      .map((c) => c.id),
  );
  return contents.some((c) => c.type === "tool_result" && doneCalls.has(c.tool_use_id) && !c.is_error);
}

// 利用者がセッションを開いているなど claude rm が断ったものは、閉じずに記録へ理由を残し、次の実行で閉じ直す。
// 会話の記録がないセッションは、何も書き込まずに終わったものなので対象にしない。
for (const id of fs.readdirSync(JOBS)) {
  const stateFile = path.join(JOBS, id, "state.json");
  if (!fs.existsSync(stateFile)) continue;
  const { name, tempo, linkScanPath } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (!name?.endsWith(NAME_SUFFIX) || tempo !== "idle" || !linkScanPath || !fs.existsSync(linkScanPath)) continue;
  if (!done(linkScanPath)) continue;
  const rm = spawnSync("claude", ["rm", id], { encoding: "utf8" });
  if (rm.status === 0) {
    log(`${id} ${name}: 閉じた ${rm.stdout.trim().replace(/\s+/g, " ")}`);
    console.log(`${id}\t${name}\t閉じた`);
  } else {
    log(`${id} ${name}: 閉じられなかった claude rm が失敗した（終了 ${rm.status ?? rm.signal}）: ${rm.error?.message ?? `${rm.stderr}${rm.stdout}`}`);
    console.log(`${id}\t${name}\t閉じられなかった（ ${LOG} を参照）`);
  }
}
