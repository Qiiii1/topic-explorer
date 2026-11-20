#!/bin/bash
# macOS 启动脚本：双击运行；等同于在当前目录执行 npm start。
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-4178}"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "没有找到 node。请先安装 Node.js 22 或更新版本：https://nodejs.org"
  echo
  read -r -p "按回车关闭窗口…" _
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  echo
  echo "当前 Node.js 版本是 $(node -v)，需要 22 或更新版本。"
  echo "请升级后重试：https://nodejs.org"
  echo
  read -r -p "按回车关闭窗口…" _
  exit 1
fi

(
  sleep 1.2
  open "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
) &

exec node server.mjs --port "${PORT}"
