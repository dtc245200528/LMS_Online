#!/bin/bash
# Hardening CSDL: nguyên tắc đặc quyền tối thiểu (least privilege)
#  - lms_app (ứng dụng): chỉ SELECT/INSERT/UPDATE/DELETE trên database lms, không DROP/CREATE/GRANT
#  - lms_dba (phpMyAdmin): toàn quyền nhưng CHỈ trên database lms (không phải root)
#  - root: chỉ đăng nhập từ localhost trong container (MYSQL_ROOT_HOST=localhost)
# (file được entrypoint của MySQL "source", không đặt set -u để tránh ảnh hưởng entrypoint)

mysql_root() {
  mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" "$@"
}

mysql_root <<-EOSQL
  REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${MYSQL_USER}'@'%';
  GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
  ALTER USER '${MYSQL_USER}'@'%' WITH MAX_USER_CONNECTIONS 20;

  CREATE USER IF NOT EXISTS 'lms_dba'@'%' IDENTIFIED BY '${DBA_PASSWORD}';
  GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO 'lms_dba'@'%';

  FLUSH PRIVILEGES;
EOSQL

echo "[init] Đã phân quyền tối thiểu cho ${MYSQL_USER} và tạo lms_dba"
