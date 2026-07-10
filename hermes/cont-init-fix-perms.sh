#!/command/with-contenv sh
# /opt/data/skills lo crea Docker como root (por el bind :ro de skills/custom),
# pero el hook stage2 corre como el usuario hermes (uid 10000) y necesita crear
# subdirs de categorías ahí. Le damos el directorio a hermes SIN tocar el submount
# custom (chown no recursivo). También aseguramos la carpeta de archivos de Miguel.
mkdir -p /opt/data/skills /opt/data/files
chown hermes:hermes /opt/data/skills 2>/dev/null || true
chown hermes:hermes /opt/data/files 2>/dev/null || true
exit 0
