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

# Fonts matter for fidelity: LibreOffice keeps text as vector, so the only
# way a converted PDF drifts from the Word original is font substitution.
# - ttf-mscorefonts-installer: Arial, Times New Roman, Courier (classic Office)
# - fonts-crosextra-carlito: metric-identical stand-in for Calibri
# - fonts-crosextra-caladea:  metric-identical stand-in for Cambria
#   (Calibri/Cambria are the *default* fonts in modern Word and are NOT in
#    mscorefonts -- without these, every default-font doc gets re-flowed.)
# - fonts-liberation + fonts-dejavu-core: broad Latin/Unicode fallback.
# libreoffice-gtk3 matters beyond fonts: --no-install-recommends above skips
# apt's "Recommends" dependencies, and on this Debian base that excludes the
# common-UI libraries (libcui and friends) that Writer's own --convert-to
# path needs internally -- even though nothing here touches an actual GUI.
# Without it, `soffice --headless --convert-to pdf some.docx` exits 0 but
# writes nothing, logging "Error: source file could not be loaded" to
# stderr: a known upstream LibreOffice regression (convert-to for Writer
# documents needs libcui, excluded from headless/no-GUI package splits),
# fixed upstream in 7.6.5+/24.2.1+ but still present in what this Debian
# base's repo currently serves. Reproduced live, confirmed via this exact
# stderr message, and confirmed PDF->Word (Draw/Writer-PDF-import path,
# unaffected) kept working the entire time on the same container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-gtk3 \
    ttf-mscorefonts-installer \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-dejavu-core \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
