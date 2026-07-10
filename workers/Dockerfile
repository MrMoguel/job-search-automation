# Imagen oficial de Playwright: incluye browsers + deps del sistema ya resueltas
# (evita el infierno de dependencias de Chromium en Debian/Ubuntu al migrar a Linux)
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Los browsers ya vienen en la imagen base, pero forzamos instalación
# por si el package.json fija una versión de playwright distinta a la de la imagen
RUN npx playwright install --with-deps chromium

COPY src ./src

# Directorio para storageState persistente (sesiones logueadas de LinkedIn / portales)
RUN mkdir -p /app/.auth-state

EXPOSE 3000

CMD ["node", "src/server.js"]
