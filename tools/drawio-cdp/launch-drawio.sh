#!/bin/bash
# Launch DrawIO desktop with plugins and the DevTools protocol on port 9333,
# then wait until the page is reachable. Usage: launch-drawio.sh [file.drawio]
#
# Refuses to start while any DrawIO process is still alive: relaunching while
# the previous instance is exiting has wiped DrawIO's Local Storage before
# (plugin list, Confluence credentials).
set -u
DRAWIO=${DRAWIO:-/home/dad/drawio_source_code/drawio-desktop/dist/linux-unpacked/drawio}
export DISPLAY=${DISPLAY:-:10.0}

if pgrep -x drawio >/dev/null; then
  echo "DrawIO is still running — quit it first (quit-drawio.sh)." >&2
  exit 1
fi

nohup "$DRAWIO" --no-sandbox --enable-plugins --remote-debugging-port=9333 "$@" \
  > "${TMPDIR:-/tmp}/drawio-cdp.log" 2>&1 &

for i in $(seq 1 30); do
  curl -s localhost:9333/json >/dev/null 2>&1 && break
  sleep 1
done
sleep 6   # let Draw.loadPlugin callbacks run
curl -s localhost:9333/json >/dev/null 2>&1 && echo "DrawIO ready on :9333" || { echo "DrawIO did not start" >&2; exit 1; }
