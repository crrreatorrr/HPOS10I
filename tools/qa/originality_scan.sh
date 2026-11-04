#!/usr/bin/env bash
# QA originality scan: finds names of existing franchises, studios, real
# people and real brands in the project's text files, file names and folder
# names (and optionally commit messages). Owned by QA.
#
# Usage:
#   tools/qa/originality_scan.sh [project_dir] [options]
#
# Options:
#   --reveal            print the matched terms in plain text (default: masked,
#                       so output can be pasted into reports and CI logs)
#   --commits[=RANGE]   also scan commit messages (default range: HEAD)
#   --no-files          skip files and names (with --commits: messages only)
#   --denylist=FILE     encoded denylist (default: tools/qa/denylist.b64)
#   --allow=FILE        allowlist (default: tools/qa/originality_allow.txt)
#   --list-terms        print the decoded denylist with term ids and exit
#
# The denylist is base64 of a plain list, one term per line ('#' lines are
# category comments). It is decoded only in memory. To edit it:
#   python3 -m base64 -d tools/qa/denylist.b64 > /tmp/terms.txt   # outside the repo
#   ... edit ...
#   python3 -m base64 -e /tmp/terms.txt > tools/qa/denylist.b64
# Never commit the plain list.
#
# Matching: case-insensitive, accents folded, apostrophes dropped. A term
# matches as a whole word: the characters around it must not be letters
# (digits, '_' and '-' count as boundaries, so snake_case and kebab-case
# names are caught). camelCase is split before matching. Multi-word terms
# match with any of space, '_', '-', '.' or nothing between the words.
# An optional plural 's'/'es' is allowed.
#
# Files scanned: git-tracked and untracked-but-not-ignored files when the
# project is a git checkout, otherwise every file. Skipped: .git/, .godot/,
# .worktrees/, build/, the denylist and allowlist themselves.
# Text types: .gd .tscn .tres .md .json .cfg .yml .yaml .txt .html .htm
# .godot .import .svg .sh .py .js .css .csv .xml .ini .toml .po .pot
# .gdshader .shader and dotfiles. Every file and folder name is checked.
#
# Allowlist lines: `<path glob>` or `<path glob>:<line>` (relative to the
# project), to accept a reviewed false positive. Comments start with '#'.
#
# Output: one hit per line, `path:line: <masked term> [#id] | <excerpt>`.
# Exit: 0 clean, 1 hits found, 2 usage or denylist error.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir=""
args=()
for arg in "$@"; do
	case "$arg" in
		--*) args+=("$arg") ;;
		*)
			if [[ -n "$project_dir" ]]; then
				echo "originality_scan: unexpected argument '$arg'" >&2
				exit 2
			fi
			project_dir="$arg"
			;;
	esac
done
project_dir="${project_dir:-$(cd "$script_dir/../.." && pwd)}"
if [[ ! -d "$project_dir" ]]; then
	echo "originality_scan: no such directory '$project_dir'" >&2
	exit 2
fi
project_dir="$(cd "$project_dir" && pwd)"

exec python3 -I - "$project_dir" "$script_dir" "${args[@]+"${args[@]}"}" <<'PY'
import base64
import fnmatch
import os
import re
import subprocess
import sys
import unicodedata

project = sys.argv[1]
script_dir = sys.argv[2]
opts = sys.argv[3:]

reveal = False
commits = None
denylist_path = os.path.join(script_dir, "denylist.b64")
allow_path = os.path.join(script_dir, "originality_allow.txt")
list_terms = False
scan_files = True
for opt in opts:
    if opt == "--reveal":
        reveal = True
    elif opt == "--commits":
        commits = "HEAD"
    elif opt.startswith("--commits="):
        commits = opt.split("=", 1)[1]
    elif opt.startswith("--denylist="):
        denylist_path = opt.split("=", 1)[1]
    elif opt.startswith("--allow="):
        allow_path = opt.split("=", 1)[1]
    elif opt == "--list-terms":
        list_terms = True
    elif opt == "--no-files":
        scan_files = False
    else:
        sys.stderr.write("originality_scan: unknown option %s\n" % opt)
        sys.exit(2)

TEXT_EXT = {
    ".ts", ".mts", ".cts", ".tsx", ".mjs", ".cjs",
    ".gd", ".tscn", ".tres", ".md", ".json", ".cfg", ".yml", ".yaml", ".txt",
    ".html", ".htm", ".godot", ".import", ".svg", ".sh", ".py", ".js", ".css",
    ".csv", ".xml", ".ini", ".toml", ".po", ".pot", ".gdshader", ".shader",
}
SKIP_DIRS = {".git", ".godot", ".worktrees", "build", "node_modules"}
MAX_BYTES = 5 * 1024 * 1024
SEP = r"[\s_\-.]*"

# ---- denylist -------------------------------------------------------------
try:
    raw = open(denylist_path, "rb").read()
    plain = base64.b64decode(b"".join(raw.split()), validate=True).decode("utf-8")
except Exception as exc:  # noqa: BLE001
    sys.stderr.write("originality_scan: cannot decode denylist %s: %s\n" % (denylist_path, exc))
    sys.exit(2)

terms = []  # (id, term)
for number, line in enumerate(plain.splitlines(), 1):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    terms.append((number, line))
if not terms:
    sys.stderr.write("originality_scan: denylist is empty\n")
    sys.exit(2)

if list_terms:
    for number, term in terms:
        print("#%d\t%s" % (number, term))
    sys.exit(0)


def normalize(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.replace("'", "").replace("’", "").replace("`", "")


def decamel(text):
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)


def term_body(term):
    if term.startswith("re:"):
        return term[3:]
    words = normalize(term).lower().split()
    return SEP.join(re.escape(w) for w in words)


groups = []
by_group = {}
for index, (number, term) in enumerate(sorted(terms, key=lambda t: -len(t[1]))):
    name = "t%d" % index
    groups.append("(?P<%s>%s)" % (name, term_body(term)))
    by_group[name] = (number, term)
MATCHER = re.compile(r"(?<![a-z])(?:%s)(?:e?s)?(?![a-z])" % "|".join(groups))
LOOSE = {number: re.compile(term_body(term), re.I) for number, term in terms}


# Matching (same results as one finditer of MATCHER, much faster): a match
# can only start at a word start, so at each word start only the terms whose
# first word begins with the same one or two letters are tried, longest term
# first, exactly as the alternation in MATCHER orders them.
ORDERED = sorted(terms, key=lambda t: -len(t[1]))
TERM_RES = []
BY_ONE = {}
BY_TWO = {}
for index, (number, term) in enumerate(ORDERED):
    TERM_RES.append((number, re.compile(r"(?:%s)(?:e?s)?(?![a-z])" % term_body(term))))
    first = normalize(term).lower().split()[0]
    if len(first) == 1:
        BY_ONE.setdefault(first, []).append(index)
    else:
        BY_TWO.setdefault(first[:2], []).append(index)
WORD_START = re.compile(r"(?<![a-z])[^\W_]")


def match_variant(variant, found):
    pos = 0
    for m in WORD_START.finditer(variant):
        i = m.start()
        if i < pos:
            continue
        candidates = BY_ONE.get(variant[i], []) + BY_TWO.get(variant[i:i + 2], [])
        if not candidates:
            continue
        for index in sorted(candidates):
            number, pattern = TERM_RES[index]
            hit = pattern.match(variant, i)
            if hit:
                found.setdefault(number, hit.group(0))
                pos = hit.end()
                break


def find_terms(text):
    """Returns {term_id: matched_text} for one line or name."""
    found = {}
    norm = normalize(text)
    for variant in {norm.lower(), decamel(norm).lower()}:
        match_variant(variant, found)
    return found


def mask(word):
    if reveal:
        return word
    letters = [i for i, c in enumerate(word) if c.isalnum()]
    out = list(word)
    for i in letters[1:-1] if len(letters) > 2 else letters[1:]:
        out[i] = "*"
    return "".join(out)


def masked_excerpt(text, ids):
    text = normalize(text).strip()
    if not reveal:
        for number in ids:
            text = LOOSE[number].sub(lambda m: mask(m.group(0)), text)
    return text if len(text) <= 140 else text[:137] + "..."


# ---- allowlist ------------------------------------------------------------
allow = []
if os.path.isfile(allow_path):
    for line in open(allow_path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        glob, _, lineno = line.rpartition(":")
        if glob and lineno.isdigit():
            allow.append((glob, int(lineno)))
        else:
            allow.append((line, None))


def allowed(path, lineno):
    for glob, line in allow:
        if fnmatch.fnmatch(path, glob) and (line is None or line == lineno):
            return True
    return False


# ---- file list ------------------------------------------------------------
skip_files = {os.path.realpath(denylist_path), os.path.realpath(allow_path)}


def list_files():
    try:
        out = subprocess.run(
            ["git", "-C", project, "ls-files", "-co", "--exclude-standard", "-z"],
            check=True, capture_output=True,
        ).stdout.decode("utf-8", "replace")
        files = [f for f in out.split("\0") if f]
    except (OSError, subprocess.CalledProcessError):
        files = []
        for root, dirs, names in os.walk(project):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for name in names:
                files.append(os.path.relpath(os.path.join(root, name), project))
    result = []
    for rel in sorted(set(files)):
        parts = rel.split("/")
        if any(p in SKIP_DIRS for p in parts[:-1]):
            continue
        full = os.path.join(project, rel)
        if not os.path.isfile(full) or os.path.realpath(full) in skip_files:
            continue
        result.append(rel)
    return result


hits = []  # (sort key, text)
HAS_LETTER = re.compile(r"[^\W\d_]")


def mask_path(rel):
    """Masks denied terms inside a path, so the output itself stays clean."""
    if reveal:
        return rel
    parts = []
    for part in rel.split("/"):
        for number in find_terms(part):
            part = LOOSE[number].sub(lambda m: mask(m.group(0)), part)
        parts.append(part)
    return "/".join(parts)


def report(location, found, excerpt_source):
    location = mask_path(location)
    for number, matched in sorted(found.items()):
        line = "%s: %s [#%d]" % (location, mask(matched), number)
        if excerpt_source is not None:
            line += " | " + masked_excerpt(excerpt_source, [number])
        hits.append(line)


files = list_files() if scan_files else []
seen_dirs = set()
text_files = 0
for rel in files:
    parts = rel.split("/")
    for depth in range(len(parts) - 1):
        folder = "/".join(parts[: depth + 1])
        if folder in seen_dirs:
            continue
        seen_dirs.add(folder)
        found = find_terms(parts[depth])
        if found and not allowed(folder + "/", 0):
            report(folder + "/ (folder name)", found, None)
    found = find_terms(parts[-1])
    if found and not allowed(rel, 0):
        report(rel + " (file name)", found, None)

    name = parts[-1]
    ext = os.path.splitext(name)[1].lower()
    if ext not in TEXT_EXT and not (name.startswith(".") and ext == ""):
        continue
    full = os.path.join(project, rel)
    if os.path.getsize(full) > MAX_BYTES:
        continue
    text_files += 1
    with open(full, encoding="utf-8", errors="replace") as handle:
        for lineno, line in enumerate(handle, 1):
            # Fast path: a line with no letters can't hold a term (tile rows
            # in the level data are all numbers).
            if not HAS_LETTER.search(line):
                continue
            found = find_terms(line)
            if found and not allowed(rel, lineno):
                report("%s:%d" % (rel, lineno), found, line)

commit_count = 0
if commits is not None:
    try:
        log = subprocess.run(
            ["git", "-C", project, "log", "--format=%h%x00%B%x01", commits],
            check=True, capture_output=True,
        ).stdout.decode("utf-8", "replace")
    except (OSError, subprocess.CalledProcessError) as exc:
        sys.stderr.write("originality_scan: cannot read commits %s: %s\n" % (commits, exc))
        sys.exit(2)
    for entry in log.split("\x01"):
        entry = entry.strip("\n")
        if "\x00" not in entry:
            continue
        sha, body = entry.split("\x00", 1)
        commit_count += 1
        for lineno, line in enumerate(body.splitlines(), 1):
            found = find_terms(line)
            if found:
                report("commit %s:%d" % (sha, lineno), found, line)

for line in hits:
    print(line)
summary = "originality_scan: %d terms, %d files (%d text), %d folders" % (
    len(terms), len(files), text_files, len(seen_dirs))
if commits is not None:
    summary += ", %d commits" % commit_count
summary += ", %d hits" % len(hits)
print(summary)
sys.exit(1 if hits else 0)
PY
