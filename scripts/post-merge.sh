#!/bin/bash
set -e

npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

cd backend && npx drizzle-kit push --yes 2>/dev/null || true && cd ..
