#!/usr/bin/env node
// シナリオを Playwright で実行し、章立てと注釈つきの動画（.webm）に残す。
//
//   node record.mjs <scenario.mjs> --out <video.webm>
//     [--size 1280x720] [--profile <dir>] [--headed] [--playwright <dir>]
//
// シナリオは次の形の ES モジュール:
//   export default async ({ page, context, chapter, note, wait }) => { ...; return 実測値 };
// 戻り値は JSON で標準出力に出る。
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./load-playwright.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const scenarioPath = args[0];
const out = option("out");
if (!scenarioPath || scenarioPath.startsWith("--") || !out) {
  throw new Error("usage: node record.mjs <scenario.mjs> --out <video.webm> [--size 1280x720] [--profile <dir>] [--headed] [--playwright <dir>]");
}
const [width, height] = (option("size") ?? "1280x720").split("x").map(Number);
const size = { width, height };

const { chromium } = loadPlaywright(option("playwright"));

const videoDir = mkdtempSync(join(tmpdir(), "demo-video-"));
const recordVideo = { dir: videoDir, size };
const headless = !args.includes("--headed");
const profile = option("profile");
const browser = profile ? undefined : await chromium.launch({ headless });
const context = profile
  ? await chromium.launchPersistentContext(resolve(profile), { headless, viewport: size, recordVideo })
  : await browser.newContext({ viewport: size, recordVideo });
const page = context.pages()[0] ?? (await context.newPage());

// 章と注釈はページの DOM に重ねて描く。遷移で消えるので、呼ぶたびに作り直す
const OVERLAY = ({ kind, title, text }) => {
  const id = `__demo_${kind}`;
  document.getElementById(id)?.remove();
  if (!title && !text) return;
  const el = document.createElement("div");
  el.id = id;
  el.style.cssText =
    kind === "chapter"
      ? "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);backdrop-filter:blur(6px);font-family:'Hiragino Sans','Noto Sans JP',system-ui,sans-serif;"
      : "position:fixed;right:24px;bottom:24px;max-width:620px;z-index:2147483647;padding:12px 16px;border-radius:8px;background:rgba(255,214,102,.97);color:#111;font:600 15px/1.6 'Hiragino Sans','Noto Sans JP',system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);";
  if (kind === "chapter") {
    const card = document.createElement("div");
    card.style.cssText = "background:rgba(40,40,46,.96);color:#fff;border-radius:14px;padding:22px 40px;text-align:center;min-width:420px;";
    const h = document.createElement("div");
    h.style.cssText = "font-size:26px;font-weight:800;";
    h.textContent = title;
    const p = document.createElement("div");
    p.style.cssText = "margin-top:6px;color:#c9ccd3;font-size:15px;";
    p.textContent = text ?? "";
    card.append(h, p);
    el.append(card);
  } else {
    el.style.whiteSpace = "pre-line";
    el.textContent = text;
  }
  document.body.append(el);
};
const startedAt = Date.now();
const chapters = [];
const wait = (ms) => page.waitForTimeout(ms);
const chapter = async (title, text, ms = 2500) => {
  chapters.push({ title, at: Number(((Date.now() - startedAt) / 1000).toFixed(1)) });
  await page.evaluate(OVERLAY, { kind: "chapter", title, text });
  await wait(ms);
  await page.evaluate(OVERLAY, { kind: "chapter" });
};
const note = async (text, ms = 6000) => {
  await page.evaluate(OVERLAY, { kind: "note", text });
  await wait(ms);
  await page.evaluate(OVERLAY, { kind: "note" });
};

let result;
try {
  const { default: scenario } = await import(pathToFileURL(resolve(scenarioPath)).href);
  result = await scenario({ page, context, chapter, note, wait });
} finally {
  const video = page.video();
  await context.close();
  await browser?.close();
  copyFileSync(await video.path(), resolve(out));
  rmSync(videoDir, { recursive: true, force: true });
}
console.log(JSON.stringify({ video: resolve(out), size, chapters, result }, null, 2));
