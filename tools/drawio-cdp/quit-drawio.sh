#!/bin/bash
# Quit the test DrawIO: SIGTERM, click "Discard Changes" if asked, wait for full exit.
PID=$(pgrep -x -o drawio)   # oldest process named exactly drawio = main; never pgrep -f (matches our own shell)
[ -z "$PID" ] && { echo "not running"; exit 0; }
kill $PID; sleep 2
if DISPLAY=:10.0 wmctrl -l | grep -q " Confirm$"; then
  G=$(DISPLAY=:10.0 xwininfo -name Confirm | awk '/Absolute upper-left X/{x=$4}/Absolute upper-left Y/{y=$4}END{print x,y}')
  DISPLAY=:10.0 wmctrl -a Confirm; sleep 0.3
  DISPLAY=:10.0 python3 - $G <<'PY'
import sys, time
from Xlib import X, display
from Xlib.ext import xtest
d = display.Display(); x, y = int(sys.argv[1]) + 485, int(sys.argv[2]) + 101
xtest.fake_input(d, X.MotionNotify, x=x, y=y); d.sync(); time.sleep(0.2)
xtest.fake_input(d, X.ButtonPress, 1); xtest.fake_input(d, X.ButtonRelease, 1); d.sync()
PY
fi
for i in $(seq 1 30); do pgrep -x drawio >/dev/null || break; sleep 1; done
pgrep -x drawio >/dev/null && echo "STILL RUNNING" || echo "exited"
