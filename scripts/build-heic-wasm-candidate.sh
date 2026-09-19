#!/usr/bin/env bash
set -euo pipefail

LIBHEIF_VERSION="1.23.4"
LIBHEIF_SHA="4e14f5942c1732ace9611b9522cc991501445463"
LIBDE265_VERSION="1.1.1"
LIBDE265_SHA="4dd701fffac01632ffd5cabc5ef10deb56accba1"
LIBHEIF_JS_VERSION="1.23.2"
LIBHEIF_JS_SHA="6ca00b818c0ff51cb2a5c75b9ce97d708083335a"
EMSCRIPTEN_VERSION="3.1.61"

ROOT="${1:-/tmp/lumeo-heic-wasm}"
OUT="${2:-$PWD/.heic-decoder-candidate}"
rm -rf "$ROOT" "$OUT"
mkdir -p "$ROOT" "$OUT"

clone_exact() {
  local repo="$1" sha="$2" dest="$3"
  git init -q "$dest"
  git -C "$dest" remote add origin "$repo"
  git -C "$dest" fetch -q --depth=1 origin "$sha"
  git -C "$dest" checkout -q --detach FETCH_HEAD
  test "$(git -C "$dest" rev-parse HEAD)" = "$sha"
}

echo "== Toolchain =="
cmake --version | head -1
git --version
node --version

clone_exact https://github.com/emscripten-core/emsdk.git "$(git ls-remote https://github.com/emscripten-core/emsdk.git refs/tags/$EMSCRIPTEN_VERSION | awk '{print $1}')" "$ROOT/emsdk"
"$ROOT/emsdk/emsdk" install "$EMSCRIPTEN_VERSION"
"$ROOT/emsdk/emsdk" activate "$EMSCRIPTEN_VERSION"
# shellcheck disable=SC1091
source "$ROOT/emsdk/emsdk_env.sh"

clone_exact https://github.com/strukturag/libde265.git "$LIBDE265_SHA" "$ROOT/libde265"
clone_exact https://github.com/strukturag/libheif.git "$LIBHEIF_SHA" "$ROOT/libheif"
clone_exact https://github.com/catdad-experiments/libheif-js.git "$LIBHEIF_JS_SHA" "$ROOT/libheif-js"

echo "== Build libde265 $LIBDE265_VERSION =="
emcmake cmake -S "$ROOT/libde265" -B "$ROOT/build-libde265" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$ROOT/de265-prefix" \
  -DBUILD_SHARED_LIBS=OFF \
  -DENABLE_SDL=OFF \
  -DENABLE_SIMD=OFF \
  -DENABLE_DECODER=OFF \
  -DENABLE_ENCODER=OFF \
  -DENABLE_SHERLOCK265=OFF \
  -DENABLE_INTERNAL_DEVELOPMENT_TOOLS=OFF \
  -DWITH_FUZZERS=OFF
cmake --build "$ROOT/build-libde265" --target de265 -j2
cmake --install "$ROOT/build-libde265"

DE265_A="$(find "$ROOT/de265-prefix" -type f -name 'libde265.a' -print -quit)"
test -n "$DE265_A"
test -f "$ROOT/de265-prefix/include/libde265/de265.h"

echo "== Build libheif $LIBHEIF_VERSION =="
emcmake cmake -S "$ROOT/libheif" -B "$ROOT/build-libheif" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_DOCUMENTATION=OFF \
  -DENABLE_PLUGIN_LOADING=OFF \
  -DENABLE_MULTITHREADING_SUPPORT=OFF \
  -DWITH_EXAMPLES=OFF \
  -DWITH_GDK_PIXBUF=OFF \
  -DWITH_LIBDE265=ON \
  -DWITH_LIBDE265_PLUGIN=OFF \
  -DLIBDE265_INCLUDE_DIR="$ROOT/de265-prefix/include" \
  -DLIBDE265_LIBRARY="$DE265_A" \
  -DWITH_AOM_DECODER=OFF \
  -DWITH_AOM_ENCODER=OFF \
  -DWITH_DAV1D=OFF \
  -DWITH_RAV1E=OFF \
  -DWITH_SvtEnc=OFF \
  -DWITH_X265=OFF \
  -DWITH_KVAZAAR=OFF \
  -DWITH_JPEG_DECODER=OFF \
  -DWITH_JPEG_ENCODER=OFF \
  -DWITH_OpenJPEG_DECODER=OFF \
  -DWITH_OpenJPEG_ENCODER=OFF \
  -DWITH_OPENJPH_ENCODER=OFF \
  -DWITH_FFMPEG_DECODER=OFF \
  -DWITH_OpenH264_DECODER=OFF \
  -DWITH_UVG266=OFF \
  -DWITH_VVDEC=OFF \
  -DWITH_VVENC=OFF \
  -DWITH_UNCOMPRESSED_CODEC=OFF \
  -DWITH_WEBCODECS=OFF \
  -DWITH_HEADER_COMPRESSION=OFF \
  -DWITH_LIBSHARPYUV=OFF
cmake --build "$ROOT/build-libheif" --target heif -j2

LIBHEIF_A="$ROOT/build-libheif/libheif/libheif.a"
test -f "$LIBHEIF_A"

echo "== Link browser WASM =="
NM="$EMSDK/upstream/bin/llvm-nm"
EXPORTED_FUNCTIONS="$("$NM" "$LIBHEIF_A" "$DE265_A" --format=just-symbols \
  | grep -E '^(heif_|de265_)' | grep '[^:]$' | sort -u | sed 's/^/_/' | paste -sd ',' -)"

mkdir -p "$ROOT/raw/libheif-wasm"
emcc -Wl,--whole-archive "$LIBHEIF_A" -Wl,--no-whole-archive "$DE265_A" \
  -lembind \
  -o "$ROOT/raw/libheif-wasm/libheif.js" \
  --post-js "$ROOT/libheif/post.js" \
  -sWASM=1 \
  -sDYNAMIC_EXECUTION=0 \
  -sMODULARIZE \
  -sEXPORT_NAME=libheif \
  -sWASM_ASYNC_COMPILATION=0 \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS,_free,_malloc,_memcpy" \
  -O3

cp "$ROOT/libheif/COPYING" "$ROOT/raw/libheif-wasm/LICENSE"
tar -C "$ROOT/raw" -czf "$ROOT/libheif-candidate.tar.gz" libheif-wasm

echo "== Reuse pinned libheif-js bundling layer =="
pushd "$ROOT/libheif-js" >/dev/null
# Upstream 1.23.2 uses npm but commits no lockfile. Bootstrap a deterministic
# lock from a fixed registry cutoff; CI uploads it so this research branch can
# pin the exact resolved dependency graph in the next revision.
npm install --package-lock-only --ignore-scripts --before=2026-09-19T00:00:00Z
cp package-lock.json "$OUT/libheif-js.package-lock.json"
npm ci --ignore-scripts
node scripts/install.js "$ROOT/libheif-candidate.tar.gz"
popd >/dev/null

cp "$ROOT/libheif-js/libheif-wasm/libheif-bundle.mjs" "$OUT/libheif-bundle.mjs"
cp "$ROOT/libheif-js/libheif-wasm/libheif.js" "$OUT/libheif.js"
cp "$ROOT/libheif-js/libheif-wasm/libheif.wasm" "$OUT/libheif.wasm"
cp "$ROOT/libheif/COPYING" "$OUT/LICENSE.libheif"
cp "$ROOT/libde265/COPYING" "$OUT/LICENSE.libde265"

cat > "$OUT/verify-versions.mjs" <<'NODE'
import { pathToFileURL } from "node:url";
const bundle = process.argv[2];
const create = (await import(pathToFileURL(bundle).href)).default;
const lib = await create({ print() {}, printErr() {} });
const heif = lib.heif_get_version_number();
const de265 = lib._de265_get_version_number();
console.log(JSON.stringify({ heif: `0x${heif.toString(16).padStart(8, "0")}`, de265: `0x${de265.toString(16).padStart(8, "0")}` }));
if (heif !== 0x01170400) throw new Error(`unexpected libheif numeric version: 0x${heif.toString(16)}`);
if (de265 !== 0x01010100) throw new Error(`unexpected libde265 numeric version: 0x${de265.toString(16)}`);
NODE
node "$OUT/verify-versions.mjs" "$OUT/libheif-bundle.mjs"

{
  echo "libheif_version=$LIBHEIF_VERSION"
  echo "libheif_sha=$LIBHEIF_SHA"
  echo "libde265_version=$LIBDE265_VERSION"
  echo "libde265_sha=$LIBDE265_SHA"
  echo "libheif_js_bundler_version=$LIBHEIF_JS_VERSION"
  echo "libheif_js_bundler_sha=$LIBHEIF_JS_SHA"
  echo "emscripten_version=$EMSCRIPTEN_VERSION"
  cmake --version | head -1
  sha256sum "$OUT/libheif-bundle.mjs" "$OUT/libheif.js" "$OUT/libheif.wasm"
} | tee "$OUT/PROVENANCE.txt"

echo "Candidate artifacts written to $OUT"
