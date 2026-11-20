#!/usr/bin/env node
// Auto Review が始めたレビューのセッションのうち、レビューの Issue を Done にしたものを claude rm で閉じる。
// worktree とそのブランチも一緒に消える。呼び方は 2 つある。
//   close.mjs --hook : Stop フックから標準入力で呼ばれる。Done にしたターンの終わりに、閉じる子を切り離して始めてすぐ戻る。
//                      子は、利用者がセッションから離れて claude rm が通るまで、数秒おきにやり直す。
//   close.mjs        : 定期タスク Auto Review が毎回の実行で呼ぶ。入力待ちのレビューのセッションのうち、Done にしたものをまとめて閉じる。
//                      閉じたものと閉じられなかったものを、id、名前、結果のタブ区切りで 1 行ずつ出す。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Auto Review の SKILL.md が決めるセッションの名前の末尾。どちらかを変えるときは両方をそろえる。
const NAME_SUFFIX = " のレビュー";
const DONE = "Done";
// 利用者がセッションを開いている間、claude rm が断るときの文言。これで断られたときだけやり直す。
const IN_USE = "A live Claude Code session";
const WAIT_MINUTES = 30;
const RETRY_SECONDS = 5;

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
const JOBS = path.join(CLAUDE_HOME, "jobs");
const LOG = path.join(CLAUDE_HOME, "auto-review", "close.log");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stateFile = (id) => path.join(JOBS, id, "state.json");
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

// claude rm で閉じ、断られたときはその理由を返す。
function remove(id, name) {
  const rm = spawnSync("claude", ["rm", id], { encoding: "utf8" });
  if (rm.status === 0) {
    log(`${id} ${name}: 閉じた ${rm.stdout.trim().replace(/\s+/g, " ")}`);
    return null;
  }
  return `claude rm が失敗した（終了 ${rm.status ?? rm.signal}）: ${rm.error?.message ?? `${rm.stderr}${rm.stdout}`}`;
}

// フックの処理：Auto Review のセッションで Done にした呼び出しが成功していれば、閉じる子を切り離して始める。
// 別のフックの言い直しで重なった Stop（ stop_hook_active ）では、最初の Stop が始めた子に任せる。
function hook() {
  const input = readJson(0);
  if (input.stop_hook_active) return;
  const id = input.session_id.slice(0, 8);
  if (!fs.existsSync(stateFile(id))) return;
  const state = readJson(stateFile(id));
  if (state.sessionId !== input.session_id || !state.name?.endsWith(NAME_SUFFIX)) return;
  if (!done(input.transcript_path)) return;
  spawn(process.execPath, [fileURLToPath(import.meta.url), "--wait", id], { detached: true, stdio: "ignore" }).unref();
}

// 子の処理：入力待ちになり、利用者がセッションから離れて claude rm が通るまでやり直す。
// 開いていること以外の理由で断られたら、やり直さずに記録へ残す。定期タスクの実行や別の子が先に閉じていれば、何もせず終わる。
async function wait(id) {
  const { name } = readJson(stateFile(id));
  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  let reason = "入力待ちにならない";
  while (Date.now() < deadline) {
    if (!fs.existsSync(stateFile(id))) return;
    if (readJson(stateFile(id)).tempo === "idle") {
      reason = remove(id, name);
      if (reason === null) return;
      if (!reason.includes(IN_USE)) break;
    }
    await sleep(RETRY_SECONDS * 1000);
  }
  if (!fs.existsSync(stateFile(id))) return;
  log(`${id} ${name}: 閉じられなかった ${reason}`);
  process.exit(1);
}

// 定期タスクの処理：利用者が開いているなど claude rm が断ったものは、閉じずに記録へ理由を残し、次の実行で閉じ直す。
// 会話の記録がないセッションは、何も書き込まずに終わったものなので対象にしない。
function sweep() {
  for (const id of fs.readdirSync(JOBS)) {
    if (!fs.existsSync(stateFile(id))) continue;
    const { name, tempo, linkScanPath } = readJson(stateFile(id));
    if (!name?.endsWith(NAME_SUFFIX) || tempo !== "idle" || !linkScanPath || !fs.existsSync(linkScanPath)) continue;
    if (!done(linkScanPath)) continue;
    const reason = remove(id, name);
    if (reason === null) {
      console.log(`${id}\t${name}\t閉じた`);
    } else {
      log(`${id} ${name}: 閉じられなかった ${reason}`);
      console.log(`${id}\t${name}\t閉じられなかった（ ${LOG} を参照）`);
    }
  }
}

const mode = process.argv[2];
if (mode === "--hook") hook();
else if (mode === "--wait") await wait(process.argv[3]);
else if (mode === undefined) sweep();
else throw new Error(`知らない引数: ${mode}`);
