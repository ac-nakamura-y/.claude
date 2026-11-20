#!/usr/bin/env node
// 録画した動画から、指定の秒数のコマを PNG に書き出す。録画が意図どおりかを目で確かめるために使う。
//
//   node frames.mjs <video.webm> <out dir> <秒> [<秒> ...] [--playwright <dir>]
//
// Playwright の録画は目次（キュー）を持たず、シークすると先頭のコマに戻る。
// そのため 4 倍速で再生し、指定の秒数を過ぎたところで止めて撮る。
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./load-playwright.mjs";

const args = process.argv.slice(2);
const pwIndex = args.indexOf("--playwright");
const playwrightDir = pwIndex === -1 ? undefined : args.splice(pwIndex, 2)[1];
const [videoArg, outArg, ...secondArgs] = args;
const seconds = secondArgs.map(Number).sort((a, b) => a - b);
if (!videoArg || !outArg || seconds.length === 0 || seconds.some(Number.isNaN)) {
  throw new Error("usage: node frames.mjs <video.webm> <out dir> <秒> [<秒> ...] [--playwright <dir>]");
}

const { chromium } = loadPlaywright(playwrightDir);

const video = resolve(videoArg);
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });
const player = join(dirname(video), `.frames-${basename(video)}.html`);
writeFileSync(player, `<body style="margin:0;background:#000"><video id="v" muted src="${encodeURI(basename(video))}"></video></body>`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(player).href);
  const size = await page.evaluate(
    () =>
      new Promise((done, fail) => {
        const v = document.getElementById("v");
        v.onerror = () => fail(new Error("動画を読み込めません"));
        if (v.readyState >= 1) done([v.videoWidth, v.videoHeight]);
        else v.onloadedmetadata = () => done([v.videoWidth, v.videoHeight]);
      }),
  );
  await page.waitForFunction(() => document.getElementById("v").readyState >= 1);
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.evaluate(() => {
    const v = document.getElementById("v");
    v.playbackRate = 4;
    return v.play();
  });
  const files = [];
  for (const t of seconds) {
    await page.waitForFunction(
      (x) => {
        const v = document.getElementById("v");
        return v.currentTime >= x || v.ended;
      },
      t,
      { timeout: (t / 4 + 30) * 1000 },
    );
    const at = await page.evaluate(() => {
      const v = document.getElementById("v");
      v.pause();
      return v.currentTime;
    });
    if (at < t) console.error(`${t} 秒は動画の長さ（${at.toFixed(1)} 秒）を超えています。最後のコマを撮ります`);
    const file = join(outDir, `frame-${at.toFixed(1).padStart(6, "0")}s.png`);
    await page.screenshot({ path: file });
    files.push(file);
    await page.evaluate(() => document.getElementById("v").play());
  }
  console.log(JSON.stringify({ size, files }, null, 2));
} finally {
  await browser.close();
  rmSync(player, { force: true });
}
