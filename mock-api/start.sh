#!/bin/sh
# 一键启动所有 mock 服务（已在运行的自动跳过并纳入管理）
cd "$(dirname "$0")"
mkdir -p .pids

for entry in "server.js:3090" "face-server.js:3091"; do
  s="${entry%%:*}"
  port="${entry##*:}"
  log="${s%.js}.log"
  pidfile=".pids/$s.pid"

  pid="$(lsof -ti :"$port" -sTCP:LISTEN -n -P 2>/dev/null | head -1)"
  if [ -n "$pid" ]; then
    case "$(ps -p "$pid" -o command= 2>/dev/null)" in
      *node*)
        echo "[skip] $s 已在 :$port 运行 (pid $pid)"
        echo "$pid" > "$pidfile"
        ;;
      *)
        echo "[warn] :$port 被非 node 进程 (pid $pid) 占用，无法启动 $s"
        ;;
    esac
    continue
  fi

  nohup node "$s" > "$log" 2>&1 < /dev/null &
  pid=$!
  echo "$pid" > "$pidfile"
  sleep 0.5
  if kill -0 "$pid" 2>/dev/null; then
    echo "[ok] $s → http://localhost:$port (pid $pid, log $log)"
  else
    echo "[fail] $s 启动失败，查看 $log"
    rm -f "$pidfile"
  fi
done
