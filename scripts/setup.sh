#!/usr/bin/env bash
# =============================================================
# Chuẩn bị môi trường lần đầu:
#   1. Sinh file .env với mật khẩu ngẫu nhiên, mạnh (không commit lên GitHub)
#   2. Sinh chứng chỉ HTTPS tự ký cho Nginx
#   3. Sinh file .htpasswd (Basic Auth) bảo vệ phpMyAdmin
# Chạy lại an toàn: file nào đã có sẽ được giữ nguyên.
# =============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

rand() { openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | cut -c1-"${1:-24}"; }

# ---------- 1. .env ----------
if [[ -f .env ]]; then
  echo "[setup] .env đã tồn tại -> giữ nguyên"
else
  ADMIN_PASS="Lms@$(rand 12)"
  BASIC_PASS="$(rand 16)"
  cat > .env <<EOF
# File sinh tự động bởi scripts/setup.sh - KHÔNG commit lên GitHub
DOMAIN=localhost

# MySQL
MYSQL_ROOT_PASSWORD=$(rand 32)
MYSQL_DATABASE=lms
MYSQL_USER=lms_app
MYSQL_PASSWORD=$(rand 28)
DBA_PASSWORD=$(rand 24)

# Ứng dụng
SESSION_SECRET=$(rand 64)
ADMIN_EMAIL=admin@lms.local
ADMIN_PASSWORD=${ADMIN_PASS}

# Basic Auth cho /phpmyadmin/
BASIC_AUTH_USER=lmsadmin
BASIC_AUTH_PASSWORD=${BASIC_PASS}
EOF
  chmod 600 .env
  echo "[setup] Đã tạo .env (quyền 600)"
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

# ---------- 2. Chứng chỉ tự ký ----------
mkdir -p nginx/certs
if [[ -f nginx/certs/lms.crt ]]; then
  echo "[setup] Chứng chỉ đã có -> giữ nguyên"
else
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout nginx/certs/lms.key -out nginx/certs/lms.crt \
    -subj "/C=VN/ST=Thai Nguyen/O=LMS Demo/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" 2>/dev/null
  chmod 644 nginx/certs/lms.crt nginx/certs/lms.key   # Nginx (UID 101) cần đọc được
  echo "[setup] Đã tạo chứng chỉ HTTPS tự ký"
fi

# ---------- 3. Basic Auth ----------
mkdir -p nginx/auth
if [[ -f nginx/auth/.htpasswd ]]; then
  echo "[setup] .htpasswd đã có -> giữ nguyên"
else
  printf '%s:%s\n' "$BASIC_AUTH_USER" "$(openssl passwd -apr1 "$BASIC_AUTH_PASSWORD")" > nginx/auth/.htpasswd
  chmod 644 nginx/auth/.htpasswd
  echo "[setup] Đã tạo nginx/auth/.htpasswd"
fi

cat <<EOF

==================== THÔNG TIN ĐĂNG NHẬP ====================
Website LMS        : https://${DOMAIN}/
  Admin            : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
phpMyAdmin         : https://${DOMAIN}/phpmyadmin/
  Lớp 1 Basic Auth : ${BASIC_AUTH_USER} / ${BASIC_AUTH_PASSWORD}
  Lớp 2 MySQL      : lms_dba / (DBA_PASSWORD trong .env)
=============================================================
Tiếp theo: docker compose up -d --build
EOF
