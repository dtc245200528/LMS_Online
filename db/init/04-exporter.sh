#!/bin/bash
# Tài khoản chỉ-đọc cho mysqld-exporter (Prometheus), giới hạn 3 kết nối
mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
  CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY '${MYSQLD_EXPORTER_PASSWORD}' WITH MAX_USER_CONNECTIONS 3;
  GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
  FLUSH PRIVILEGES;
EOSQL

echo "[init] Đã tạo user exporter cho Prometheus"
