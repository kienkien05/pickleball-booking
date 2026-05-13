#!/bin/bash
# Pickleball Booking System - Quick Start (Linux/Mac)

set -e

echo "============================================"
echo "  PICKLEBALL BOOKING SYSTEM - Quick Start"
echo "============================================"
echo ""

# ---- Config ----
export DB_HOST=${DB_HOST:-localhost}
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-pickleball}
export DB_USER=${DB_USER:-postgres}
export DB_PASSWORD=${DB_PASSWORD:-123456}
export PORT=${PORT:-3000}

# ---- Check Node.js ----
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js chưa được cài đặt!"
    echo "Tải tại: https://nodejs.org"
    exit 1
fi
echo "[OK] Node.js: $(node -v)"

# ---- Check PostgreSQL ----
if command -v psql &> /dev/null; then
    echo "[..] Kiểm tra kết nối PostgreSQL..."
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &> /dev/null; then
        echo "[OK] PostgreSQL kết nối thành công"
    else
        echo "[ERROR] Không thể kết nối PostgreSQL!"
        echo "  Host: $DB_HOST:$DB_PORT | DB: $DB_NAME | User: $DB_USER"
        echo "  Tạo database: psql -U postgres -c \"CREATE DATABASE pickleball;\""
        exit 1
    fi
else
    echo "[WARN] psql không tìm thấy, bỏ qua kiểm tra DB..."
fi

# ---- Install dependencies ----
if [ ! -d "server/node_modules" ]; then
    echo "[..] Cài đặt dependencies..."
    cd server && npm install && cd ..
    echo "[OK] Dependencies đã cài xong"
else
    echo "[OK] Dependencies đã có sẵn"
fi

# ---- Seed (optional) ----
read -p "Bạn có muốn nạp lại dữ liệu mẫu? (y/N): " SEED_CHOICE
if [[ "$SEED_CHOICE" =~ ^[Yy]$ ]]; then
    echo "[..] Đang seed dữ liệu mẫu..."
    cd server && npm run seed && cd ..
    echo "[OK] Seed xong!"
fi

# ---- Start ----
echo ""
echo "============================================"
echo "  Server đang khởi động..."
echo "  URL: http://localhost:$PORT"
echo "  Admin: admin@pickleball.vn / admin123"
echo "  User:  user1@gmail.com / 123456"
echo "  Nhấn Ctrl+C để dừng server"
echo "============================================"
echo ""

cd server
node src/index.js
