#!/bin/sh
# Wrapper: Hermes (browser_connect.py) lanza el browser sin --no-sandbox, pero
# Chromium corriendo como root en el contenedor lo necesita. Interponemos estos
# flags y delegamos al binario real de Debian.
exec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
