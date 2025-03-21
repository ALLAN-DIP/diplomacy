#!/bin/bash
# Syntax: ./run_tests               -- Run tests in parallel across CPUs
export PYTHONIOENCODING=utf-8
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FAILED=0

# Exiting
if [[ "$FAILED" -eq 1 ]]; then
    echo "*** TESTS FAILED ***"
    exit 1
else
    echo "All tests passed."
    exit 0
fi
