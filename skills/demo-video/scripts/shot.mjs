#!/usr/bin/env node
// URL かローカルの HTML を開き、静止画（PNG）を撮る。下見と、成果物（HTML など）の画像づくりに使う。
//
//   node shot.mjs <URL かファイル> <out.png> [--size 1280x720] [--full] [--eval "<ページで実行する JS>"] [--playwright <dir>]
//
// --full は縦に長いページを最後まで撮る。--eval は撮る前にページで実行する（例: "show(2)"）。
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./load-playwright.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const [target, out] = args;
if (!target || !out || target.startsWith("--")) {
  throw new Error('usage: node shot.mjs <URL かファイル> <out.png> [--size 1280x720] [--full] [--eval "<JS>"] [--playwright <dir>]');
}
const [width, height] = (option("size") ?? "1280x720").split("x").map(Number);
const url = existsSync(target) ? pathToFileURL(resolve(target)).href : target;

const { chromium } = loadPlaywright(option("playwright"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const script = option("eval");
  if (script) await page.evaluate(script);
  await page.screenshot({ path: resolve(out), fullPage: args.includes("--full") });
  console.log(resolve(out));
} finally {
  await browser.close();
}
