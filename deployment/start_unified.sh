#!/bin/bash

# Cleanup function
cleanup() {
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $DB_VIEWER_PID 2>/dev/null || true
    exit 0
}

# Trap signals
trap cleanup SIGINT SIGTERM

# Start Backend
echo "🚀 Starting Backend..."
# Kill port 8000 just in case
fuser -k 8000/tcp || true
./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start DB Viewer
echo "🚀 Starting DB Viewer..."
# Kill port 8090 just in case
fuser -k 8090/tcp || true
sleep 2
./venv/bin/sqlite_web vistaiot.db --host 0.0.0.0 --port 8090 --no-browser &
DB_VIEWER_PID=$!

# Wait for processes
wait $BACKEND_PID $DB_VIEWER_PID

