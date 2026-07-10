# Imagen de Hermes extendida con un browser local + stack de display, para que
# el toolset `browser` (modo CDP local) y `computer_use` funcionen DENTRO del
# contenedor y Miguel pueda VER a Hermes trabajar vía noVNC.
#
# No se toca el ENTRYPOINT (s6-overlay /init + main-wrapper): el display se
# arranca con un script cont-init.d, así la supervisión base queda intacta.
FROM nousresearch/hermes-agent:latest

# Chromium real (Debian trixie, no snap) + VNC/noVNC + WM. Xvfb ya viene en base.
# poppler-utils (pdftotext) + tesseract (OCR, incl. español) para que Hermes LEA
# los archivos de Miguel (CV en PDF). El agente corre como usuario no-root y no
# puede apt-install al vuelo, así que estas tools van horneadas en la imagen.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium x11vnc fluxbox novnc websockify x11-utils \
      poppler-utils tesseract-ocr tesseract-ocr-spa \
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html \
    && rm -rf /var/lib/apt/lists/*

# Chrome como root exige --no-sandbox y en contenedor conviene --disable-dev-shm-usage.
# browser_connect.py NO agrega esos flags, así que interponemos un wrapper con los
# nombres que Hermes busca primero (google-chrome-stable, luego chromium).
COPY chrome-wrapper.sh /usr/local/bin/google-chrome-stable
RUN cp /usr/local/bin/google-chrome-stable /usr/local/bin/chromium \
    && chmod +x /usr/local/bin/google-chrome-stable /usr/local/bin/chromium

# Fix de permisos de /opt/data/skills ANTES del stage2 (00 < 01), para que Hermes
# pueda copiar/usar sus skills de documentos (ocr-and-documents, pdf, etc.).
COPY cont-init-fix-perms.sh /etc/cont-init.d/00-fix-skills-perms
RUN chmod +x /etc/cont-init.d/00-fix-skills-perms

# Arranque del display virtual + noVNC vía s6 cont-init (corre antes del gateway).
COPY cont-init-display.sh /etc/cont-init.d/50-display
RUN chmod +x /etc/cont-init.d/50-display

# Chromium persistente (perfil logueado de Miguel + CDP 9222) al que Hermes se
# attachea vía browser.cdp_url. Corre después del display.
COPY cont-init-browser.sh /etc/cont-init.d/60-browser
RUN chmod +x /etc/cont-init.d/60-browser

ENV DISPLAY=:99
EXPOSE 6080
