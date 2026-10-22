#!/usr/bin/env bash
# Sinh lưu lượng giả lập để dashboard Grafana và truy vấn LogQL có dữ liệu khi demo.
#   ./scripts/demo-traffic.sh [số_vòng]
set -uo pipefail
BASE="${BASE_URL:-https://localhost}"
ROUNDS="${1:-20}"
C="curl -sk -o /dev/null -w %{http_code}"

echo "Gửi lưu lượng tới $BASE ($ROUNDS vòng)..."
for i in $(seq 1 "$ROUNDS"); do
  $C "$BASE/" >/dev/null                                   # trang chủ
  $C "$BASE/?q=docker" >/dev/null                          # tìm kiếm
  $C "$BASE/courses/$(( (i % 4) + 1 ))" >/dev/null         # chi tiết khóa học
  $C "$BASE/khong-ton-tai-$i" >/dev/null                   # 404
  $C "$BASE/metrics" >/dev/null                            # bị Nginx chặn -> 404
done

# Đăng nhập sai 8 lần (cần CSRF token nên lấy cookie + token trước).
# Kỳ vọng: khoảng 6 lần đầu HTTP 401, các lần sau HTTP 429 do Nginx rate limit.
JAR=$(mktemp)
for i in $(seq 1 8); do
  TOKEN=$(curl -sk -c "$JAR" -b "$JAR" "$BASE/login" | sed -n 's/.*name="_csrf" value="\([a-f0-9]*\)".*/\1/p' | head -1)
  code=$(curl -sk -o /dev/null -w '%{http_code}' -c "$JAR" -b "$JAR" \
    --data-urlencode "_csrf=$TOKEN" --data-urlencode "email=hacker$i@test.vn" --data-urlencode "password=SaiMatKhau$i" \
    "$BASE/login")
  echo "  Đăng nhập sai lần $i -> HTTP $code"
done
rm -f "$JAR"

echo "Xong. Mở Grafana (https://localhost/grafana/) để xem dashboard và Explore → Loki."
