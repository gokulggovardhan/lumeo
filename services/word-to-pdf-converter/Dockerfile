# Deploy this directory (services/word-to-pdf-converter) to a real container
# host -- Render, Fly.io, Railway, etc. Vercel's standard Next.js deployment
# does not build a Dockerfile for the main app, so LibreOffice cannot live
# there; this is a small, separately-hosted service the main app calls
# over HTTP instead.
#
# bookworm, not bullseye: the current official LibreOffice build (see the
# LO_VERSION install below) is linked against GLIBC_2.33/2.34 and libstdc++
# symbols bullseye's glibc 2.31 doesn't have -- oosplash refuses to even
# start on bullseye ("version `GLIBC_2.34' not found"). Confirmed locally.
FROM node:18-bookworm-slim

RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections

# ttf-mscorefonts-installer lives in Debian's non-free "contrib" component,
# which bookworm-slim doesn't enable by default -- without this the package
# has "no installation candidate" and the build fails at this exact step.
# bookworm's node image uses deb822-format sources (Components: main), not
# the classic one-line sources.list bullseye used.
RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources

# Fonts matter for fidelity: LibreOffice keeps text as vector, so the only
# way a converted PDF drifts from the Word original is font substitution.
# - ttf-mscorefonts-installer: Arial, Times New Roman, Courier (classic Office)
# - fonts-crosextra-carlito: metric-identical stand-in for Calibri
# - fonts-crosextra-caladea:  metric-identical stand-in for Cambria
#   (Calibri/Cambria are the *default* fonts in modern Word and are NOT in
#    mscorefonts -- without these, every default-font doc gets re-flowed.)
# - fonts-liberation + fonts-dejavu-core: broad Latin/Unicode fallback.
# libxinerama1/libx11-6/libxrender1/libsm6/libice6: soffice's launcher
# (oosplash) and libuno_sal link against these even in headless mode --
# without them it fails immediately with "libXinerama.so.1 => not found".
RUN apt-get update && apt-get install -y --no-install-recommends \
    ttf-mscorefonts-installer \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-dejavu-core \
    ca-certificates \
    libxinerama1 \
    libx11-6 \
    libxrender1 \
    libsm6 \
    libice6 \
    libglu1-mesa \
    libdbus-1-3 \
    libcups2 \
    libssl3 \
    libnss3 \
    libnspr4 \
    libcairo2 \
    libglib2.0-0 \
    libfontconfig1 \
    libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

# TDF's generic Linux build expects the unversioned SONAME "libssl3.so";
# Debian's libssl3 package only ships the versioned libssl.so.3 (the
# unversioned symlink normally only exists in the -dev package, which we
# don't want to pull in just for this one symlink).
RUN ln -sf /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl3.so \
  && ln -sf /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto3.so

# Root cause (confirmed live via a startup `soffice --version` log): the
# original bullseye base's apt repo only served LibreOffice 7.0.4.2. That
# version has a known upstream regression where headless Writer
# --convert-to exits 0 but writes nothing, logging "Error: source file
# could not be loaded" to stderr -- fixed upstream in 7.6.5+/24.2.1+, but
# 7.0.4.2 predates the fix. Installing libreoffice-gtk3 (previous attempt)
# did not change the version and did not fix it. PDF->Word kept working
# throughout because it doesn't exercise the broken Writer convert-to path.
# Fix: install a current stable release straight from The Document
# Foundation's official deb bundle instead of any distro's apt package.
# curl is purged again at the end of this layer -- it's only needed to
# fetch the bundle, not at runtime, and keeping it out of this RUN's final
# layer keeps the image smaller.
ARG LO_VERSION=26.2.4
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && curl -fsSL -o /tmp/lo.tar.gz \
      "https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/deb/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_deb.tar.gz" \
  && mkdir /tmp/lo && tar -xzf /tmp/lo.tar.gz -C /tmp/lo --strip-components=1 \
  && (dpkg -i /tmp/lo/DEBS/*.deb || true) \
  && apt-get install -y -f --no-install-recommends \
  && ln -sf /opt/libreoffice*/program/soffice /usr/bin/soffice \
  && apt-get purge -y curl && apt-get autoremove -y \
  && rm -rf /tmp/lo /tmp/lo.tar.gz /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
