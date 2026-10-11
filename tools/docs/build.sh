#!/usr/bin/env bash
# Builds the manual: docs/iorg.org, and from it docs/iorg.html - one page,
# searchable, with the contents down the side.
#
#   tools/docs/build.sh                 build from what is there
#   tools/docs/build.sh --screenshots   take the screenshots again first
#   SCENES=table,plot tools/docs/build.sh --screenshots   just those
#
# Needs node, and the orgs repository beside this one (or ORGS_DIR): docex
# gathers the manual and the orgs html exporter renders it, with its docs
# theme. Screenshots need VS Code (VSCODE_PATH, or the usual macOS place).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORGS="${ORGS_DIR:-$ROOT/../orgs}"
BUILD="$ROOT/build/docs"
SHOTS=0
[ "${1:-}" = "--screenshots" ] && SHOTS=1

if [ ! -d "$ORGS/cmd/docex" ]; then
    echo "build.sh: the orgs repository is not at $ORGS (set ORGS_DIR)" >&2
    exit 1
fi
mkdir -p "$BUILD/bin" "$BUILD/guides"

echo "== tools"
(cd "$ORGS" && go build -o "$BUILD/bin/docex" ./cmd/docex && go build -o "$BUILD/bin/orgs" ./cmd/orgs)

if [ $SHOTS = 1 ]; then
    echo "== demo workspace and server"
    DEMO="$BUILD/demo"
    rm -rf "$DEMO" && mkdir -p "$DEMO"
    cp -R "$ROOT/tools/docs/demo/." "$DEMO/"
    # Dates relative to today, so the agenda always has something on it.
    node -e '
        const fs = require("fs"), path = require("path"), dir = process.argv[1];
        const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        const day = n => { const d = new Date(); d.setDate(d.getDate() + n);
            const p = x => String(x).padStart(2, "0");
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${days[d.getDay()]}`; };
        const subs = { TODAY: day(0), YESTERDAY: day(-1), IN1: day(1), IN3: day(3) };
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".org"))) {
            const p = path.join(dir, f);
            fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => subs[k] || m));
        }' "$DEMO"
    PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
    cat > "$BUILD/demo.yaml" <<EOF
server:
  orgDirs:
    - "$DEMO"
  noAuth: true
  accessControl: "*"
  allowHttps: true
  servercrt: "$ORGS/server.crt"
  serverkey: "$ORGS/server.key"
  babel:
    enable: true
    languages: ["python"]
  exporters:
    - name: "html"
    - name: "revealjs"
    - name: "latex"
  captureTemplates:
    - name: "Inbox"
      type: "entry"
      target:
        type: "file+headline"
        filename: "plan.org"
        id: "Inbox"
EOF
    TLS=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
    (cd "$ORGS" && "$BUILD/bin/orgs" -config "$BUILD/demo.yaml" serve -port "$PORT" -tlsport "$TLS" > "$BUILD/server.log" 2>&1 &)
    trap 'pkill -f "$BUILD/demo.yaml" || true' EXIT
    for i in $(seq 1 40); do curl -s "http://localhost:$PORT/status" >/dev/null && break; sleep 0.5; done

    echo "== screenshots"
    (cd "$ROOT" && npm run --silent compile)
    node "$ROOT/tools/docs/screenshots.js" --demo "$DEMO" --out "$ROOT/docs/images" --orgs "http://localhost:$PORT" --scenes "${SCENES:-}"
fi

echo "== references from package.json"
rm -f "$BUILD"/guides/*.org
cp "$ROOT"/docs/guide/*.org "$BUILD/guides/"
rm -f "$BUILD/guides/overview.org"
node "$ROOT/tools/docs/reference.js" "$BUILD/guides"

echo "== docex"
"$BUILD/bin/docex" -src "$ROOT/src" -ext .ts -title "IOrg - Org mode for VS Code" \
    -guides "$BUILD/guides" -start "$ROOT/docs/guide/overview.org" -out "$ROOT/docs/iorg.org"

echo "== html"
# A server of its own for the length of one export, reading docs/. It reads
# its templates from the orgs checkout, so it runs from there.
cat > "$BUILD/export.yaml" <<EOF
server:
  orgDirs:
    - "$ROOT/docs"
  noAuth: true
  exporters:
    - name: "html"
EOF
(cd "$ORGS" && "$BUILD/bin/orgs" -config "$BUILD/export.yaml" -local export -f html -theme docs -query iorg.org -out "$ROOT/docs/iorg.html" 2>"$BUILD/export.log") \
    || { echo "build.sh: the html export failed - see $BUILD/export.log" >&2; exit 1; }
node "$ROOT/tools/docs/enhance.js" "$ROOT/docs/iorg.html"

echo
echo "Built docs/iorg.org and docs/iorg.html"
