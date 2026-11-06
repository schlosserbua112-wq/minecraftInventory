# Wird von scripts/pi-bundle.mjs befüllt: collector.mjs ist der fertig gebündelte Sammler.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY collector.mjs ./
# Einstellungen der Kachel liegen im Volume /data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
# Im Leerlauf braucht der Sammler 50–80 MB. Beim Zeichnen der Karte (über 600 Regionen,
# Biom-Ebene über die ganze Welt) reichten 96 MB nicht mehr, der Prozess starb mittendrin.
# Die Grenze ist nur eine Obergrenze, im Leerlauf bleibt der Verbrauch gleich.
CMD ["node", "--max-old-space-size=384", "collector.mjs"]
