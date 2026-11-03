#!/bin/sh
# 一键停止所有 mock 服务（并清理 3090-3099 端口段的游离 node 进程）
cd "$(dirname "$0")"

for pidfile in .pids/*.pid; do
  [ -f "$pidfile" ] || continue
  s="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile" 2>/dev/null)"
  if [ -n "$pid" ] && kill $pid 2>/dev/null; then
    echo "[ok] $s 已停止 (pid $pid)"
  else
    echo "[skip] $s 无运行中的进程"
  fi
  rm -f "$pidfile"
done

sleep 0.5
for pid in $(lsof -ti :3090-3099 -sTCP:LISTEN -n -P 2>/dev/null | sort -u); do
  case "$(ps -p "$pid" -o command= 2>/dev/null)" in
    *node*)
      kill "$pid" 2>/dev/null && echo "[ok] 已停止游离 mock 进程 (pid $pid)"
      ;;
  esac
done
