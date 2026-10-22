<?php
// Hardening phpMyAdmin
// - Không cho đăng nhập bằng root (dùng tài khoản lms_dba chỉ có quyền trên DB lms)
$cfg['Servers'][1]['AllowRoot'] = false;
$cfg['Servers'][1]['AllowNoPassword'] = false;
// - Tự đăng xuất sau 30 phút không thao tác
$cfg['LoginCookieValidity'] = 1800;
// - Ẩn thông tin phiên bản và các database hệ thống
$cfg['VersionCheck'] = false;
$cfg['ShowServerInfo'] = false;
$cfg['Servers'][1]['hide_db'] = '^(information_schema|performance_schema|mysql|sys)$';
