#!/bin/sh
set -eu

TEST_FILE="${TEST_FILE:-blazedemo_perf.js}"

if [ "$#" -ge 1 ]; then
  case "$1" in
    *.js)
      TEST_FILE="$1"
      shift
      ;;
  esac
fi

RESULTS_DIR="${RESULTS_DIR:-/results}"
SUMMARY_JSON="${SUMMARY_JSON:-summary.json}"
K6_ARGS="${K6_ARGS:-}"

mkdir -p "$RESULTS_DIR"

echo "[entry] k6 script      : ${TEST_FILE}"
echo "[entry] results dir    : ${RESULTS_DIR}"
echo "[entry] summary export : ${RESULTS_DIR}/${SUMMARY_JSON}"
echo "[entry] extra k6 args  : ${K6_ARGS} $*"

SUMMARY_OPT="--summary-export=${RESULTS_DIR}/${SUMMARY_JSON}"

exec k6 run ${SUMMARY_OPT} ${K6_ARGS} "$@" "${TEST_FILE}"
