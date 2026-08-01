#!/bin/bash

# Start development servers for sitegeist
# Usage: ./dev.sh

set -e

echo "Starting development servers..."
echo ""

# Kill all child processes on exit
trap 'echo ""; echo "Stopping all dev servers..."; kill 0' EXIT INT TERM

# Start dev servers
echo "Starting sitegeist dev server..."
npm run dev &

echo "Starting sitegeist site dev server..."
(cd site && ./run.sh dev) &

echo ""
echo "All dev services started"
echo "  sitegeist: watching (includes web-ui)"
echo "  site backend: http://localhost:3000"
echo "  site frontend: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background jobs
wait
