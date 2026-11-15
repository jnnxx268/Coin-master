#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

ERRORS=0
WARNINGS=0

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; ERRORS=$((ERRORS + 1)); }
warn() { printf '  WARN  %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }

FIRST="supabase/migrations/20261113090000_secure_financial_request_workflows.sql"
SECOND="supabase/migrations/20261113110000_internal_admin_financial_workflows.sql"

echo
echo "========================================"
echo " COINMASTER MIGRATION SAFETY CHECK"
echo " LOCAL ONLY — NO HOSTED DEPLOYMENT"
echo "========================================"

echo
echo "[1/5] Checking migration files"

for file in "$FIRST" "$SECOND"; do
    if [[ -f "$file" ]]; then
        pass "$file exists"
    else
        fail "$file is missing"
    fi
done

if [[ -f "$FIRST" && -f "$SECOND" ]]; then
    FIRST_VERSION="${FIRST##*/}"
    FIRST_VERSION="${FIRST_VERSION%%_*}"
    SECOND_VERSION="${SECOND##*/}"
    SECOND_VERSION="${SECOND_VERSION%%_*}"

    if [[ "$FIRST_VERSION" < "$SECOND_VERSION" ]]; then
        pass "Migration filename order is correct"
    else
        fail "Second migration does not sort after the first"
    fi

    for version in "$FIRST_VERSION" "$SECOND_VERSION"; do
        if python3 -c 'import datetime,sys; datetime.datetime.strptime(sys.argv[1], "%Y%m%d%H%M%S")' "$version" 2>/dev/null; then
            pass "Migration timestamp $version is a valid date/time"
        else
            fail "Migration timestamp $version is not a valid date/time"
        fi
    done
fi

echo
echo "[2/5] Checking for dangerous historical-data operations"

if [[ -f "$FIRST" && -f "$SECOND" ]]; then
    if grep -nEi '^[[:space:]]*(TRUNCATE|DELETE[[:space:]]+FROM|DROP[[:space:]]+TABLE)[[:space:]]' "$FIRST" "$SECOND"; then
        warn "Review these destructive SQL statements manually"
    else
        pass "No top-level TRUNCATE, DELETE FROM or DROP TABLE statements found"
    fi

    if grep -nEi '^[[:space:]]*(UPDATE|DELETE[[:space:]]+FROM)[[:space:]]' "$FIRST" "$SECOND"; then
        warn "Review data-changing SQL manually for historical preservation"
    else
        pass "No top-level UPDATE or DELETE statements found"
    fi
fi

echo
echo "[3/5] Running existing local accounting tests"

if [[ -x "supabase/tests/run-accounting-local.sh" ]] || [[ -f "supabase/tests/run-accounting-local.sh" ]]; then
    if bash supabase/tests/run-accounting-local.sh; then
        pass "Local accounting test suite"
    else
        fail "Local accounting test suite"
    fi
else
    fail "Accounting test runner not found"
fi

echo
echo "[4/5] Checking application code"

if node -e "const p=require('./package.json');process.exit(p.scripts?.lint?0:1)" 2>/dev/null; then
    if npm run lint; then
        pass "Application lint"
    else
        fail "Application lint"
    fi
else
    warn "No lint script configured"
fi

if node -e "const p=require('./package.json');process.exit(p.scripts?.build?0:1)" 2>/dev/null; then
    if npm run build; then
        pass "Application build"
    else
        fail "Application build"
    fi
else
    warn "No build script configured"
fi

echo
echo "[5/5] Final result"
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"

if (( ERRORS > 0 )); then
    echo
    echo "RESULT: FAIL — DO NOT DEPLOY"
    exit 1
fi

echo
echo "RESULT: LOCAL CHECKS PASSED"
echo "This is not permission to deploy. Review warnings and migration"
echo "semantics, historical-data preservation and hosted compatibility first."
exit 0
