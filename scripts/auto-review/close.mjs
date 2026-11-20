#!/usr/bin/env node
// Auto Review が始めたレビューのセッションが返信を書き込み、レビューの Issue を Done にしたら、
// セッションを claude rm で閉じる。worktree とそのブランチも一緒に消える。
// 閉じる機会は 2 つある。
// - Stop フック（引数なし）：そのターンが終わるのを待って閉じる。待つ処理は切り離した子（ --close <id> ）に任せてすぐ戻る。
// - 掃除（ --sweep ）：定期タスク Auto Review が毎回呼び、閉じ損ねたセッションをまとめて閉じる。
//   利用者がセッションを開いていて claude rm が断ったものも、次の実行で閉じ直す。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Auto Review の SKILL.md が決めるセッションの名前の末尾。どちらかを変えるときは両方をそろえる。
const NAME_SUFFIX = " のレビュー";
const DONE = "Done";

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
const JOBS = path.join(CLAUDE_HOME, "jobs");
const LOG = path.join(CLAUDE_HOME, "auto-review", "close.log");
const IDLE_TIMEOUT_MINUTES = 30;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stateOf = (id) => readJson(path.join(JOBS, id, "state.json"));
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

// セッションを消して結果を記録に残す。消せたかを返す。
function remove(id, name) {
  const rm = spawnSync("claude", ["rm", id], { encoding: "utf8" });
  if (rm.status === 0) {
    log(`${id} ${name}: 閉じた ${rm.stdout.trim().replace(/\s+/g, " ")}`);
    return true;
  }
  log(`${id} ${name}: 閉じられなかった claude rm が失敗した（終了 ${rm.status ?? rm.signal}）: ${rm.error?.message ?? `${rm.stderr}${rm.stdout}`}`);
  return false;
}

// 子の処理：セッションが入力待ちに落ち着くのを待って閉じる。
async function close(id) {
  const { name } = stateOf(id);
  const deadline = Date.now() + IDLE_TIMEOUT_MINUTES * 60_000;
  const idle = () => stateOf(id).tempo === "idle";
  // 一瞬の入力待ちで閉じないよう、5 秒おいても入力待ちのままであることを確かめる。
  for (;;) {
    if (idle()) {
      await sleep(5_000);
      if (idle()) break;
    }
    if (Date.now() > deadline) {
      log(`${id} ${name}: 閉じられなかった ${IDLE_TIMEOUT_MINUTES} 分待っても入力待ちにならない`);
      process.exit(1);
    }
    await sleep(2_000);
  }
  if (!remove(id, name)) process.exit(1);
}

// フックの処理：Auto Review の背景セッションで Done にしていれば、閉じる子を切り離して始める。
// 別のフックの言い直しで重なった Stop（ stop_hook_active ）では、最初の Stop が始めた子に任せる。
function detect() {
  const input = readJson(0);
  if (input.stop_hook_active) process.exit(0);
  const id = input.session_id.slice(0, 8);
  if (!fs.existsSync(path.join(JOBS, id, "state.json"))) process.exit(0);
  const state = stateOf(id);
  if (state.sessionId !== input.session_id || !state.name?.endsWith(NAME_SUFFIX)) process.exit(0);
  if (!done(input.transcript_path)) process.exit(0);
  spawn(process.execPath, [fileURLToPath(import.meta.url), "--close", id], { detached: true, stdio: "ignore" }).unref();
}

// 掃除の処理：Done にして入力待ちのまま残るレビューのセッションを閉じ、閉じたものと閉じられなかったものを 1 行ずつ出す。
// 会話の記録がないセッションは、何も書き込まずに終わったものなので対象にしない。
function sweep() {
  for (const id of fs.readdirSync(JOBS)) {
    const stateFile = path.join(JOBS, id, "state.json");
    if (!fs.existsSync(stateFile)) continue;
    const { name, tempo, linkScanPath } = readJson(stateFile);
    if (!name?.endsWith(NAME_SUFFIX) || tempo !== "idle" || !linkScanPath || !fs.existsSync(linkScanPath)) continue;
    if (!done(linkScanPath)) continue;
    console.log(`${id}\t${name}\t${remove(id, name) ? "閉じた" : `閉じられなかった（ ${LOG} を参照）`}`);
  }
}

const [mode, id] = process.argv.slice(2);
if (mode === "--close") await close(id);
else if (mode === "--sweep") sweep();
else detect();
