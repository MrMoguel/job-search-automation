#!/command/with-contenv sh
# Arranca el display virtual (Xvfb) + WM + VNC + noVNC antes de que s6 levante el
# gateway. Permite a Hermes correr Chromium headful (visible) dentro del contenedor.
# Es un oneshot de s6: lanza los daemons en background y sale 0.
export DISPLAY="${DISPLAY:-:99}"
GEOM="${SCREEN_GEOMETRY:-1360x900x24}"

echo "[display] Xvfb $DISPLAY ($GEOM)"
Xvfb "$DISPLAY" -screen 0 "$GEOM" -ac +extension RANDR >/tmp/xvfb.log 2>&1 &

# esperar a que el display responda
i=0
while [ "$i" -lt 40 ]; do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
  sleep 0.25
  i=$((i + 1))
done

echo "[display] fluxbox"
fluxbox >/tmp/fluxbox.log 2>&1 &

echo "[display] x11vnc :5900"
x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport 5900 -bg -quiet >/tmp/x11vnc.log 2>&1

echo "[display] noVNC :6080"
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "[display] listo"
exit 0
