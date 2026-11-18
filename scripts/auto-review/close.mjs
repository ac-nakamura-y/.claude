#!/usr/bin/env node
// auto-review が始めたレビューのセッションで、本人が Approve の返信を「送信する」と答えたら、
// そのターンが終わるのを待ってセッションを claude rm で閉じる。worktree とそのブランチも一緒に消える。
// Stop フックから標準入力で呼ばれ、待つ処理は切り離した子に任せてすぐ戻る。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// auto-review の SKILL.md が指示のファイルに書く問いと答え。どちらかを変えるときは両方をそろえる。
const QUESTION = "Approve の返信を送信しますか？";
const SEND = "送信する";

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
  const lock = path.join(JOBS, id, "auto-review-close.lock");
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
    fs.rmSync(lock, { force: true });
    log(`${id} ${name}: 閉じられなかった ${e.message}`);
    process.exit(1);
  }
}

// フックの処理：レビューのセッションで、最後の送信の問いへの答えが「送信する」なら、閉じる子を切り離して始める。
function detect() {
  const input = readJson(0);
  const id = input.session_id.slice(0, 8);
  const stateFile = path.join(JOBS, id, "state.json");
  if (!fs.existsSync(stateFile)) process.exit(0);
  const state = readJson(stateFile);
  if (state.sessionId !== input.session_id || !state.name?.endsWith(" のレビュー")) process.exit(0);

  const answer = fs
    .readFileSync(input.transcript_path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .findLast((row) => row.toolUseResult?.answers?.[QUESTION] !== undefined)
    ?.toolUseResult.answers[QUESTION];
  if (answer !== SEND) process.exit(0);

  // 言い直しなどで Stop が重なっても、閉じる子は 1 つだけにする。claude rm が jobs/<id> ごと消すので、閉じれば錠も消える。
  try {
    fs.closeSync(fs.openSync(path.join(JOBS, id, "auto-review-close.lock"), "wx"));
  } catch (e) {
    if (e.code === "EEXIST") process.exit(0);
    throw e;
  }
  spawn(process.execPath, [fileURLToPath(import.meta.url), "--close", id], { detached: true, stdio: "ignore" }).unref();
}

if (process.argv[2] === "--close") await close(process.argv[3]);
else detect();
