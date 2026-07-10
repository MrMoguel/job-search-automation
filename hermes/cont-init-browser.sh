#!/command/with-contenv sh
# Lanza el Chromium persistente con el perfil de Miguel (sesiones logueadas de
# las plataformas) y CDP en :9222. El toolset browser de Hermes está configurado
# con browser.cdp_url=http://127.0.0.1:9222, así que se ATTACHEA a este navegador
# ya logueado en vez de abrir uno propio sin sesión.
# Corre después de 50-display (necesita el display :99 arriba).
export DISPLAY="${DISPLAY:-:99}"

# limpiar lock huérfano de una corrida anterior (si no, Chromium no arranca)
rm -f /opt/data/chrome-debug/SingletonLock \
      /opt/data/chrome-debug/SingletonCookie \
      /opt/data/chrome-debug/SingletonSocket 2>/dev/null || true

# lanzar como el usuario hermes (dueño del perfil), headful, en background
/usr/sbin/runuser -u hermes -- env DISPLAY="$DISPLAY" HOME=/opt/data \
  /usr/local/bin/google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/opt/data/chrome-debug \
  --no-first-run --no-default-browser-check \
  about:blank >/tmp/browser.log 2>&1 &

exit 0
