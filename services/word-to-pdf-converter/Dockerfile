# Deploy this directory (services/word-to-pdf-converter) to a real container
# host -- Render, Fly.io, Railway, etc. Vercel's standard Next.js deployment
# does not build a Dockerfile for the main app, so LibreOffice cannot live
# there; this is a small, separately-hosted service the main app calls
# over HTTP instead.
FROM node:18-bullseye-slim

RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections

# ttf-mscorefonts-installer lives in Debian's non-free "contrib" component,
# which bullseye-slim doesn't enable by default -- without this the package
# has "no installation candidate" and the build fails at this exact step.
RUN sed -i 's/^\(deb .*main\)$/\1 contrib/' /etc/apt/sources.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    ttf-mscorefonts-installer \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
