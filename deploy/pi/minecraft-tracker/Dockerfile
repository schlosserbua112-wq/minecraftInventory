# Wird von scripts/pi-bundle.mjs befüllt: collector.mjs ist der fertig gebündelte Sammler.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY collector.mjs ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
# Heap klein halten (Ziel: 50–80 MB im Leerlauf)
CMD ["node", "--max-old-space-size=96", "collector.mjs"]
