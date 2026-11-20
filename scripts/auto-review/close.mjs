#!/usr/bin/env node
// auto-review が始めたレビューのセッションが返信を書き込み、レビューの Issue を Done にしたら、
// そのターンが終わるのを待ってセッションを claude rm で閉じる。worktree とそのブランチも一緒に消える。
// Stop フックから標準入力で呼ばれ、待つ処理は切り離した子に任せてすぐ戻る。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// auto-review の SKILL.md が決めるセッションの名前の末尾。どちらかを変えるときは両方をそろえる。
const NAME_SUFFIX = " のレビュー";
const DONE = "Done";

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
const JOBS = path.join(CLAUDE_HOME, "jobs");
const LOG = path.join(CLAUDE_HOME, "auto-review", "close.log");
const IDLE_TIMEOUT_MINUTES = 30;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const log = (line) => {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
};

// 子の処理：セッションが入力待ちに落ち着くのを待って閉じる。
async function close(id) {
  const stateFile = path.join(JOBS, id, "state.json");
  const { name } = readJson(stateFile);
  const deadline = Date.now() + IDLE_TIMEOUT_MINUTES * 60_000;
  const idle = () => readJson(stateFile).tempo === "idle";
  try {
    // 一瞬の入力待ちで閉じないよう、5 秒おいても入力待ちのままであることを確かめる。
    for (;;) {
      if (idle()) {
        await sleep(5_000);
        if (idle()) break;
      }
      if (Date.now() > deadline) throw new Error(`${IDLE_TIMEOUT_MINUTES} 分待っても入力待ちにならない`);
      await sleep(2_000);
    }
    const rm = spawnSync("claude", ["rm", id], { encoding: "utf8" });
    if (rm.status !== 0) throw new Error(`claude rm が失敗した（終了 ${rm.status ?? rm.signal}）: ${rm.error?.message ?? `${rm.stderr}${rm.stdout}`}`);
    log(`${id} ${name}: 閉じた ${rm.stdout.trim().replace(/\s+/g, " ")}`);
  } catch (e) {
    log(`${id} ${name}: 閉じられなかった ${e.message}`);
    process.exit(1);
  }
}

// フックの処理：auto-review の背景セッションで、レビューの Issue を Done にした呼び出しが成功していれば、閉じる子を切り離して始める。
// 書き込みの最後の手順が Done なので、判定や依頼の場所によらず、これを書き込みを終えた印とする。
// 別のフックの言い直しで重なった Stop（ stop_hook_active ）では、最初の Stop が始めた子に任せる。
function detect() {
  const input = readJson(0);
  if (input.stop_hook_active) process.exit(0);
  const id = input.session_id.slice(0, 8);
  const stateFile = path.join(JOBS, id, "state.json");
  if (!fs.existsSync(stateFile)) process.exit(0);
  const state = readJson(stateFile);
  if (state.sessionId !== input.session_id || !state.name?.endsWith(NAME_SUFFIX)) process.exit(0);

  const contents = fs
    .readFileSync(input.transcript_path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => JSON.parse(line).message?.content)
    .filter((content) => typeof content === "object" && content !== null);
  const doneCalls = new Set(
    contents
      .filter((c) => c.type === "tool_use" && c.name?.endsWith("save_issue") && c.input?.state === DONE)
      .map((c) => c.id),
  );
  const done = contents.some((c) => c.type === "tool_result" && doneCalls.has(c.tool_use_id) && !c.is_error);
  if (!done) process.exit(0);
  spawn(process.execPath, [fileURLToPath(import.meta.url), "--close", id], { detached: true, stdio: "ignore" }).unref();
}

if (process.argv[2] === "--close") await close(process.argv[3]);
else detect();
