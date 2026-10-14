#!/usr/bin/env bash
# Suite de tests GitHub Companion — aucun service externe, tout est local.
# Priorité n°1 : fuite de token. Priorité n°2 : ne jamais casser le projet.
# Couverture : GC_COVERAGE=1 bash test/run-all.sh → rapport dans coverage/ (c8).
set -uo pipefail
cd "$(dirname "$0")"
fail=0

# Couverture optionnelle : les tests EXÉCUTENT le panneau (media/*.js) et le code
# compilé (out/*.js). Node écrit sa couverture brute dans NODE_V8_COVERAGE, puis
# c8 agrège la suite en un seul rapport (lcov pour SonarQube).
raw="$(pwd)/.v8-coverage"
c8=../node_modules/.bin/c8
coverage=0
if [ "${GC_COVERAGE:-0}" = "1" ] && [ -x "$c8" ]; then
  coverage=1
  rm -rf "$raw"
  mkdir -p "$raw"
  export NODE_V8_COVERAGE="$raw"
  echo "Couverture activée (c8) → coverage/lcov.info (racine du projet)"
fi

for f in t/*.js; do
  node "$f" || fail=1
done

if [ "$coverage" = "1" ]; then
  # c8 rapporte depuis la RACINE : les motifs --include sont relatifs au cwd.
  ( cd .. && node_modules/.bin/c8 report --temp-directory="$raw" \
      --reporter=text-summary --reporter=lcov --reports-dir=coverage \
      --include='**/out/**' --include='**/media/**' ) || true
  rm -rf "$raw"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "SUITE COMPLÈTE : tout est vert ✅"
else
  echo "SUITE : au moins un test a échoué ❌"
fi
exit "$fail"
