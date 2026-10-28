#!/usr/bin/env bash
# QA static checks on an exported Godot web build. Reads files only; it never
# runs anything from the build. Owned by QA.
#
# Usage:
#   tools/qa/web_check.sh <web_build_dir> [--project=DIR]
#
# Checks:
#   files      index.html, <exe>.wasm, <exe>.pck and <exe>.js present
#   config     GODOT_CONFIG parsed; fileSizes match the files on disk
#   threads    single-threaded: GODOT_THREADS_ENABLED false,
#              ensureCrossOriginIsolationHeaders false, no *.worker.js, and the
#              wasm linear memory is not shared (no SharedArrayBuffer needed)
#   size       .pck and total size against budgets (gzip sizes printed)
#   audio      only Ogg Vorbis audio inside the .pck; if the .pck cannot be
#              listed, the project (--project, default this repo) is checked
#              for non-.ogg audio instead
#   export     no dev content (tests/, tools/, docs/, qa/, *.md, _raw/) in .pck
#   mobile     viewport meta tag present
#
# Environment (budgets in MB, 1 MB = 1 000 000 bytes):
#   PCK_BUDGET_MB=40   TOTAL_BUDGET_MB=80
# Exit: 0 no FAIL, 1 any FAIL, 2 usage error.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
build_dir=""
project_dir="$(cd "$script_dir/../.." && pwd)"
for arg in "$@"; do
	case "$arg" in
		--project=*) project_dir="${arg#--project=}" ;;
		-*) echo "web_check: unknown option '$arg'" >&2; exit 2 ;;
		*) build_dir="$arg" ;;
	esac
done
if [[ -z "$build_dir" || ! -d "$build_dir" ]]; then
	sed -n '2,25p' "$0" >&2
	exit 2
fi
build_dir="$(cd "$build_dir" && pwd)"

exec python3 -I - "$build_dir" "$project_dir" "${PCK_BUDGET_MB:-40}" "${TOTAL_BUDGET_MB:-80}" <<'PY'
import gzip
import json
import os
import re
import struct
import sys

build, project = sys.argv[1], sys.argv[2]
pck_budget = float(sys.argv[3]) * 1e6
total_budget = float(sys.argv[4]) * 1e6

results = []


def out(status, check, detail):
    results.append(status)
    print("%-4s  %-8s %s" % (status, check, detail))


def mb(n):
    return "%.1f MB" % (n / 1e6) if n >= 1e5 else "%.1f KB" % (n / 1e3)


AUDIO_SRC = re.compile(r"\.(wav|mp3|flac|aif|aiff|opus|m4a|aac|wma|mid|midi|xm|mod|it|s3m)(\.import|\.remap)?$", re.I)
AUDIO_IMPORTED_BAD = re.compile(r"\.(sample|mp3str)$", re.I)
DEV_CONTENT = re.compile(r"(^|/)(tests|tools|docs|qa)/|\.md$|(^|/)_raw/")

# ---- files and config -----------------------------------------------------
html_path = os.path.join(build, "index.html")
if not os.path.isfile(html_path):
    out("FAIL", "files", "index.html missing")
    sys.exit(1)
html = open(html_path, encoding="utf-8", errors="replace").read()

config = None
m = re.search(r"const\s+GODOT_CONFIG\s*=\s*(\{.*?\});", html, re.S)
if m:
    try:
        config = json.loads(m.group(1))
    except ValueError as exc:
        out("FAIL", "config", "GODOT_CONFIG is not valid JSON: %s" % exc)
else:
    out("FAIL", "config", "GODOT_CONFIG not found in index.html (custom shell?)")

exe = (config or {}).get("executable", "index")
paths = {ext: os.path.join(build, exe + ext) for ext in (".wasm", ".pck", ".js")}
missing = [os.path.basename(p) for p in paths.values() if not os.path.isfile(p)]
if missing:
    out("FAIL", "files", "missing: " + ", ".join(missing))
else:
    out("PASS", "files", "index.html, %s.wasm, %s.pck, %s.js present" % (exe, exe, exe))

if config is not None:
    bad = []
    for name, size in (config.get("fileSizes") or {}).items():
        full = os.path.join(build, name)
        actual = os.path.getsize(full) if os.path.isfile(full) else None
        if actual != size:
            bad.append("%s: config %s, disk %s" % (name, size, actual))
    if bad:
        out("FAIL", "config", "fileSizes mismatch (truncated or stale upload): " + "; ".join(bad))
    else:
        out("PASS", "config", "fileSizes match %s" % sorted((config.get("fileSizes") or {}).keys()))
    if config.get("gdextensionLibs"):
        out("WARN", "config", "gdextensionLibs not empty: %s" % config["gdextensionLibs"])

# ---- threads ----------------------------------------------------------------
if config is not None:
    coi = config.get("ensureCrossOriginIsolationHeaders")
    if coi is False:
        out("PASS", "threads", "ensureCrossOriginIsolationHeaders is false")
    else:
        out("FAIL", "threads", "ensureCrossOriginIsolationHeaders is %r (needs COOP/COEP headers)" % coi)
t = re.search(r"const\s+GODOT_THREADS_ENABLED\s*=\s*(true|false)\s*;", html)
if t is None:
    out("WARN", "threads", "GODOT_THREADS_ENABLED not found in index.html")
elif t.group(1) == "false":
    out("PASS", "threads", "GODOT_THREADS_ENABLED = false")
else:
    out("FAIL", "threads", "GODOT_THREADS_ENABLED = true (threaded build)")
workers = sorted(f for f in os.listdir(build) if f.endswith(".worker.js"))
if workers:
    out("FAIL", "threads", "pthread worker scripts present: %s" % workers)


def wasm_memory(path):
    """Returns a list of (where, flags) for every memory in the module."""
    data = open(path, "rb").read()
    if data[:4] != b"\0asm":
        raise ValueError("not a wasm module")

    def leb(p):
        result = shift = 0
        while True:
            b = data[p]
            p += 1
            result |= (b & 0x7F) << shift
            shift += 7
            if b < 0x80:
                return result, p

    def skip_limits(p):
        flags = data[p]
        p += 1
        _, p = leb(p)
        if flags & 1:
            _, p = leb(p)
        return flags, p

    found = []
    p = 8
    while p < len(data):
        section = data[p]
        size, p = leb(p + 1)
        end = p + size
        if section == 2:  # imports
            count, q = leb(p)
            for _ in range(count):
                n, q = leb(q)
                q += n
                n, q = leb(q)
                q += n
                kind = data[q]
                q += 1
                if kind == 0:
                    _, q = leb(q)
                elif kind == 1:
                    q += 1
                    _, q = skip_limits(q)
                elif kind == 2:
                    flags, q = skip_limits(q)
                    found.append(("imported", flags))
                elif kind == 3:
                    q += 2
                elif kind == 4:
                    q += 1
                    _, q = leb(q)
                else:
                    raise ValueError("unknown import kind %d" % kind)
        elif section == 5:  # memories
            count, q = leb(p)
            for _ in range(count):
                flags, q = skip_limits(q)
                found.append(("defined", flags))
        p = end
    return found


if os.path.isfile(paths[".wasm"]):
    try:
        memories = wasm_memory(paths[".wasm"])
        shared = [m for m in memories if m[1] & 0x02]
        if shared:
            out("FAIL", "threads", "wasm memory is shared (SharedArrayBuffer required): %s" % shared)
        elif memories:
            out("PASS", "threads", "wasm memory not shared %s" % memories)
        else:
            out("WARN", "threads", "no memory found in the wasm module")
    except (ValueError, IndexError) as exc:
        out("WARN", "threads", "could not parse wasm: %s" % exc)

# ---- size -------------------------------------------------------------------
total = 0
for root, _, names in os.walk(build):
    for name in names:
        total += os.path.getsize(os.path.join(root, name))
if os.path.isfile(paths[".pck"]):
    pck_size = os.path.getsize(paths[".pck"])
    status = "PASS" if pck_size < pck_budget else "FAIL"
    out(status, "size", ".pck %s (budget %s)" % (mb(pck_size), mb(pck_budget)))
status = "PASS" if total < total_budget else "FAIL"
out(status, "size", "total %s (budget %s)" % (mb(total), mb(total_budget)))
for ext in (".wasm", ".pck", ".js"):
    if os.path.isfile(paths[ext]):
        raw = open(paths[ext], "rb").read()
        out("INFO", "size", "%s%s %s raw, %s gzipped" % (exe, ext, mb(len(raw)), mb(len(gzip.compress(raw, 6)))))


# ---- pck contents -----------------------------------------------------------
def list_pck(path):
    data = open(path, "rb").read()
    if data[:4] != b"GDPC":
        raise ValueError("no GDPC magic (embedded or unknown format)")
    version, major, minor, patch = struct.unpack_from("<4I", data, 4)
    if version < 2:
        raise ValueError("pack format %d (Godot 3) not supported" % version)
    flags, file_base = struct.unpack_from("<IQ", data, 20)
    if flags & 1:
        raise ValueError("directory is encrypted")
    if version >= 3:
        (dir_offset,) = struct.unpack_from("<Q", data, 32)
    else:
        dir_offset = 32 + 64
    (count,) = struct.unpack_from("<I", data, dir_offset)
    p = dir_offset + 4
    entries = []
    for _ in range(count):
        (n,) = struct.unpack_from("<I", data, p)
        p += 4
        name = data[p:p + n].rstrip(b"\0").decode("utf-8", "replace")
        p += n
        _, size = struct.unpack_from("<QQ", data, p)
        p += 16 + 16 + 4
        if name.startswith("res://"):
            name = name[6:]
        entries.append((name, size))
    return "%d.%d.%d (pack format %d)" % (major, minor, patch, version), entries


def repo_audio_fallback(reason):
    out("WARN", "audio", "cannot list .pck (%s); checking the project instead: %s" % (reason, project))
    bad = []
    for root, dirs, names in os.walk(project):
        dirs[:] = [d for d in dirs if d not in (".git", ".godot", ".worktrees", "build", "node_modules")]
        for name in names:
            if AUDIO_SRC.search(name) and not name.endswith(".import"):
                bad.append(os.path.relpath(os.path.join(root, name), project))
    if bad:
        out("FAIL", "audio", "non-.ogg audio in the project: %s" % bad[:20])
    else:
        out("PASS", "audio", "no non-.ogg audio files in the project")


if os.path.isfile(paths[".pck"]):
    try:
        engine, entries = list_pck(paths[".pck"])
        out("INFO", "pck", "Godot %s, %d entries" % (engine, len(entries)))
        bad_audio = [n for n, _ in entries if AUDIO_SRC.search(n) or AUDIO_IMPORTED_BAD.search(n)]
        ogg = [n for n, _ in entries if n.endswith(".oggvorbisstr")]
        if bad_audio:
            out("FAIL", "audio", "non-Ogg audio in .pck: %s" % bad_audio[:20])
        else:
            out("PASS", "audio", "only Ogg Vorbis audio in .pck (%d streams)" % len(ogg))
        dev = [n for n, _ in entries if DEV_CONTENT.search(n)]
        if dev:
            out("FAIL", "export", "dev content in .pck (check exclude_filter): %s" % dev[:20])
        else:
            out("PASS", "export", "no tests/, tools/, docs/, qa/, *.md or _raw/ in .pck")
        biggest = sorted(entries, key=lambda e: -e[1])[:5]
        out("INFO", "pck", "largest: " + ", ".join("%s %s" % (n.split("/")[-1], mb(s)) for n, s in biggest))
    except (ValueError, struct.error, IndexError) as exc:
        repo_audio_fallback(str(exc))
else:
    repo_audio_fallback("no .pck")

# ---- mobile -----------------------------------------------------------------
if re.search(r'<meta[^>]+name=["\']viewport["\']', html, re.I):
    out("PASS", "mobile", "viewport meta tag present")
else:
    out("WARN", "mobile", "no viewport meta tag (mobile scaling)")

fails = results.count("FAIL")
warns = results.count("WARN")
print("web_check: %s -> %d FAIL, %d WARN" % (build, fails, warns))
sys.exit(1 if fails else 0)
PY
