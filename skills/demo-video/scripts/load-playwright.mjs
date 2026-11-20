// playwright パッケージを、--playwright で渡したディレクトリ → カレントディレクトリ → この Skill 専用の置き場 の順に探す。
// 専用の置き場はリポジトリの外にあり、対象プロジェクトの package.json を変えずに済む。
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const SKILL_HOME = join(homedir(), ".cache", "demo-video");

export function loadPlaywright(dir) {
  const bases = [dir, process.cwd(), SKILL_HOME].filter(Boolean);
  for (const base of bases) {
    try {
      return createRequire(join(resolve(base), "package.json"))("playwright");
    } catch {}
  }
  throw new Error(
    `playwright が見つかりません（探した場所: ${bases.join(", ")}）。次のコマンドで専用の置き場に入れてください:\n` +
      `  npm i --prefix ${SKILL_HOME} playwright && ${SKILL_HOME}/node_modules/.bin/playwright install chromium`,
  );
}
