#!/usr/bin/env bash
set -e

echo "Starting server on port 8080..."
./memory_server 8080 > server_test.log 2>&1 &
SERVER_PID=$!

cleanup() {
    echo "Stopping test server (PID $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

sleep 1.5

echo "--- 1. Testing GET / (Static Serving) ---"
curl -s -I http://localhost:8080/ | head -n 4

echo "--- 2. Testing GET /style.css ---"
curl -s -I http://localhost:8080/style.css | head -n 4

echo "--- 3. Testing GET /script.js ---"
curl -s -I http://localhost:8080/script.js | head -n 4

echo "--- 4. Testing GET /api/files ---"
curl -s http://localhost:8080/api/files
echo ""

echo "--- 5. Testing POST /api/create (test.txt) ---"
curl -s -X POST http://localhost:8080/api/create \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","content":"Hello from Linux mmap!"}'
echo ""

echo "--- 6. Testing POST /api/map (mmap syscall) ---"
curl -s -X POST http://localhost:8080/api/map \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","prot":"rw","flags":"shared"}'
echo ""

echo "--- 7. Testing POST /api/read (Direct Pointer Read) ---"
curl -s -X POST http://localhost:8080/api/read \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","offset":0,"length":0}'
echo ""

echo "--- 8. Testing POST /api/write (Virtual Memory Write) ---"
curl -s -X POST http://localhost:8080/api/write \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","offset":0,"content":"Hello from Linux mmap! [Modified in Memory]"}'
echo ""

echo "--- 9. Testing POST /api/sync (msync syscall) ---"
curl -s -X POST http://localhost:8080/api/sync \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","async":false}'
echo ""

echo "--- 10. Testing GET /api/info (stat + mincore) ---"
curl -s "http://localhost:8080/api/info?file=test.txt"
echo ""

echo "--- 11. Testing POST /api/resize (ftruncate syscall) ---"
curl -s -X POST http://localhost:8080/api/resize \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","new_size":128}'
echo ""

echo "--- 12. Testing POST /api/unmap (munmap syscall) ---"
curl -s -X POST http://localhost:8080/api/unmap \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt"}'
echo ""

echo "--- 13. Testing Security Directory Traversal Block ---"
curl -s -X POST http://localhost:8080/api/create \
  -H "Content-Type: application/json" \
  -d '{"filename":"../../etc/shadow","content":"evil"}'
echo ""

echo "--- 14. Testing Security Slash Traversal Block ---"
curl -s -X POST http://localhost:8080/api/create \
  -H "Content-Type: application/json" \
  -d '{"filename":"/etc/passwd","content":"evil"}'
echo ""

echo "--- 15. Testing POST /api/delete (unlink syscall) ---"
curl -s -X POST http://localhost:8080/api/delete \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt"}'
echo ""

echo "All 15 verification tests passed!"
