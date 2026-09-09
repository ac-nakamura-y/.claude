#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugins/agent-config/plugins"
DEST="$HOME/.cursor/plugins/local"
PLUGINS=(fde ops ac-monitor)

mkdir -p "$DEST"

for name in "${PLUGINS[@]}"; do
  src="$SRC/$name"
  dest="$DEST/$name"

  if [[ ! -d "$src" ]]; then
    echo "skip: $name (source missing; run: git submodule update --init plugins/agent-config)" >&2
    continue
  fi

  rsync -a --delete \
    --exclude '.git' \
    "$src/" "$dest/"

  mkdir -p "$dest/.cursor-plugin"
  cp "$src/.claude-plugin/plugin.json" "$dest/.cursor-plugin/plugin.json"

  if [[ -f "$src/.mcp.json" ]]; then
    python3 - "$src/.mcp.json" "$dest/mcp.json" <<'PY'
import json, sys
src, dest = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as f:
    data = json.load(f)
out = {
    "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    "mcpServers": data.get("mcpServers", data),
}
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
  fi

  python3 - "$dest" <<'PY'
import json, sys
from pathlib import Path

dest = Path(sys.argv[1])
commands = dest / "commands"
if commands.is_dir():
    for path in commands.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        text = text.replace("${CLAUDE_PLUGIN_ROOT}", "${PLUGIN_ROOT}")
        path.write_text(text, encoding="utf-8")

manifest = dest / ".cursor-plugin" / "plugin.json"
with open(manifest, encoding="utf-8") as f:
    data = json.load(f)

if (dest / "skills").is_dir():
    data["skills"] = "./skills/"
if commands.is_dir():
    data["commands"] = "./commands/"
if (dest / "hooks" / "hooks.json").is_file():
    data["hooks"] = "./hooks/hooks.json"
if (dest / "mcp.json").is_file():
    data["mcpServers"] = "./mcp.json"

with open(manifest, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY

  echo "synced: $name -> $dest"
done

echo "done. restart Cursor or run Developer: Reload Window"
