# Pickleball Booking System - Database Specification

## Tổng quan

Hệ thống quản lý đặt sân pickleball sử dụng PostgreSQL. Schema được định nghĩa trong `server/src/config/database.js` qua các lệnh `CREATE TABLE IF NOT EXISTS` và `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

**Tổng số bảng:** 13

---

## 1. Bảng `users` - Người dùng

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã định danh người dùng |
| 2 | `hoTen` | VARCHAR(100) | NOT NULL | Họ tên đầy đủ |
| 3 | `soDienThoai` | VARCHAR(15) | UNIQUE | Số điện thoại |
| 4 | `email` | VARCHAR(150) | UNIQUE, NOT NULL | Email đăng nhập |
| 5 | `matKhau` | VARCHAR(255) | NOT NULL | Mật khẩu (bcrypt hash) |
| 6 | `vaiTro` | VARCHAR(50) | DEFAULT 'Customer' | Vai trò: `Admin`, `Customer` |
| 7 | `isVIP` | BOOLEAN | DEFAULT FALSE | Đánh dấu khách VIP |
| 8 | `gioiTinh` | VARCHAR(10) | nullable | Giới tính: `Nam`, `Nữ` |
| 9 | `diaChi` | VARCHAR(255) | nullable | Địa chỉ |
| 10 | `avatar_url` | VARCHAR(500) | nullable | URL ảnh đại diện |
| 11 | `trangThai` | VARCHAR(50) | DEFAULT 'Active' | Trạng thái: `Active`, `Locked` |
| 12 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |
| 13 | `updated_at` | TIMESTAMP | DEFAULT NOW() | Thời gian cập nhật |

**Quan hệ:**
- `users` **1 : N** `bookings` (FK `nguoiDungId`)
- `users` **1 : N** `auto_booking_series` (FK `nguoiDungId`)
- `users` **1 : N** `reviews` (FK `nguoiDungId`)
- `users` **1 : N** `notifications` (FK `nguoiDungId`)
- `users` **1 : N** `discounts` (FK `nguoiDungId`, nullable - discount gán cho user cụ thể)
- `users` **1 : N** `user_vouchers` (FK `nguoiDungId`, ON DELETE CASCADE)

---

## 2. Bảng `courts` - Sân pickleball

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã sân |
| 2 | `tenSan` | VARCHAR(100) | NOT NULL | Tên sân |
| 3 | `moTa` | TEXT | nullable | Mô tả sân |
| 4 | `hinhAnh` | VARCHAR(500) | nullable | URL ảnh đại diện sân |
| 5 | `trangThai` | VARCHAR(50) | DEFAULT 'Sẵn sàng' | Trạng thái: `Sẵn sàng`, `Bảo trì`, `Active`, `Ready` |
| 6 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |
| 7 | `updated_at` | TIMESTAMP | DEFAULT NOW() | Thời gian cập nhật |

**Quan hệ:**
- `courts` **1 : N** `timeslots` (FK `sanId`, ON DELETE CASCADE)
- `courts` **1 : N** `court_images` (FK `sanId`, ON DELETE CASCADE)
- `courts` **1 : N** `bookings` (FK `sanId`)
- `courts` **1 : N** `auto_booking_series` (FK `sanId`)
- `courts` **1 : N** `reviews` (FK `sanId`, nullable - review cho sân không qua booking)

---

## 3. Bảng `timeslots` - Khung giờ

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã khung giờ |
| 2 | `sanId` | INTEGER | NOT NULL, FK → courts(id) ON DELETE CASCADE | Sân áp dụng |
| 3 | `gioBatDau` | TIME | NOT NULL | Giờ bắt đầu |
| 4 | `gioKetThuc` | TIME | NOT NULL | Giờ kết thúc |
| 5 | `mucGia` | DECIMAL(15,2) | NOT NULL | Giá tiền khung giờ |
| 6 | `trangThai` | VARCHAR(50) | DEFAULT 'Active' | Trạng thái |

**Quan hệ:** `timeslots` **1 : N** `bookings` (FK `khungGioId`)

---

## 4. Bảng `services` - Dịch vụ

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã dịch vụ |
| 2 | `tenDichVu` | VARCHAR(100) | NOT NULL | Tên dịch vụ |
| 3 | `donGia` | DECIMAL(15,2) | NOT NULL | Đơn giá |
| 4 | `loaiDichVu` | VARCHAR(50) | nullable | Loại: `Dụng cụ`, `Đồ uống` |
| 5 | `soLuongTon` | INTEGER | DEFAULT 0 | Số lượng tồn kho |
| 6 | `trangThai` | VARCHAR(50) | DEFAULT 'Còn hàng' | Trạng thái: `Còn hàng`, `Hết hàng` |
| 7 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |

**Quan hệ:** `services` **1 : N** `booking_services` (FK `dichVuId`)

---

## 5. Bảng `bookings` - Đơn đặt sân

Trung tâm của hệ thống. Kết nối người dùng, sân, khung giờ và toàn bộ quy trình thanh toán/dịch vụ.

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã đơn đặt |
| 2 | `nguoiDungId` | INTEGER | NOT NULL, FK → users(id) | Người đặt |
| 3 | `sanId` | INTEGER | NOT NULL, FK → courts(id) | Sân được đặt |
| 4 | `khungGioId` | INTEGER | NOT NULL, FK → timeslots(id) | Khung giờ đặt |
| 5 | `ngayChoi` | DATE | NOT NULL | Ngày chơi |
| 6 | `tongTien` | DECIMAL(15,2) | NOT NULL | Tổng tiền (sau giảm giá) |
| 7 | `tienDaCoc` | DECIMAL(15,2) | DEFAULT 0 | Tiền đã cọc |
| 8 | `giaGoc` | DECIMAL(15,2) | nullable | Giá gốc (trước giảm) |
| 9 | `tienGiam` | DECIMAL(15,2) | DEFAULT 0 | Tiền được giảm |
| 10 | `trangThai` | VARCHAR(50) | DEFAULT 'Đã cọc' | Luồng trạng thái (xem bên dưới) |
| 11 | `isAutoBooking` | BOOLEAN | DEFAULT FALSE | Đánh dấu đơn auto-booking |
| 12 | `autoBookingSeriesId` | INTEGER | nullable, FK → auto_booking_series(id) | Liên kết series auto-booking |
| 13 | `ghiChu` | TEXT | nullable | Ghi chú |
| 14 | `maGiamGia` | VARCHAR(50) | nullable | Mã giảm giá đã áp dụng |
| 15 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |
| 16 | `updated_at` | TIMESTAMP | DEFAULT NOW() | Thời gian cập nhật |

**Luồng trạng thái đơn (`trangThai`):**
```
Đã cọc → Đã đặt → Đã thanh toán → Đang sử dụng → Hoàn thành
   ↘____________________________↗  (có thể hủy ở bất kỳ bước nào)
              Đã hủy
```

**Quan hệ:**
- `bookings` **1 : N** `booking_services` (FK `donDatId`, ON DELETE CASCADE)
- `bookings` **1 : N** `payments` (FK `donDatId`, ON DELETE CASCADE)
- `bookings` **1 : N** `reviews` (FK `donDatId`, nullable - review có thể có hoặc không có booking)
- `bookings` **1 : N** `notifications` (FK `maDonDat`, nullable)

---

## 6. Bảng `auto_booking_series` - Chuỗi đặt sân tự động (VIP)

Tính năng VIP: tự động đặt sân định kỳ trong một khoảng thời gian.

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã series |
| 2 | `nguoiDungId` | INTEGER | NOT NULL, FK → users(id) | Người dùng VIP |
| 3 | `sanId` | INTEGER | NOT NULL, FK → courts(id) | Sân muốn đặt |
| 4 | `khungGioIds` | JSONB | NOT NULL | Mảng các khung giờ ID |
| 5 | `startDate` | DATE | NOT NULL | Ngày bắt đầu chuỗi |
| 6 | `endDate` | DATE | NOT NULL | Ngày kết thúc chuỗi |
| 7 | `repeatServices` | BOOLEAN | DEFAULT FALSE | Có lặp dịch vụ kèm theo không |
| 8 | `servicePolicy` | VARCHAR(50) | DEFAULT 'first_only' | Chính sách dịch vụ |
| 9 | `totalAmount` | DECIMAL(15,2) | DEFAULT 0 | Tổng tiền ước tính |
| 10 | `trangThai` | VARCHAR(50) | DEFAULT 'Active' | Trạng thái series |
| 11 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |
| 12 | `updated_at` | TIMESTAMP | DEFAULT NOW() | Thời gian cập nhật |

**Index:** `idx_auto_booking_series_user_status` trên `(nguoiDungId, trangThai)`

**Quan hệ:** `auto_booking_series` **1 : N** `bookings` (FK `autoBookingSeriesId`, nullable)

---

## 7. Bảng `booking_services` - Dịch vụ trong đơn (bảng nối)

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã dòng |
| 2 | `donDatId` | INTEGER | NOT NULL, FK → bookings(id) ON DELETE CASCADE | Đơn đặt |
| 3 | `dichVuId` | INTEGER | NOT NULL, FK → services(id) | Dịch vụ |
| 4 | `soLuong` | INTEGER | NOT NULL, DEFAULT 1 | Số lượng |
| 5 | `tongTien` | DECIMAL(15,2) | NOT NULL | Thành tiền = soLuong * donGia |

**Ý nghĩa:** Bảng nối many-to-many giữa bookings và services, lưu thông tin dịch vụ kèm theo mỗi đơn đặt sân.

---

## 8. Bảng `payments` - Thanh toán

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã giao dịch |
| 2 | `donDatId` | INTEGER | NOT NULL, FK → bookings(id) ON DELETE CASCADE | Đơn đặt |
| 3 | `soTien` | DECIMAL(15,2) | NOT NULL | Số tiền thanh toán |
| 4 | `loaiThanhToan` | VARCHAR(50) | NOT NULL | Phương thức: `Full - Tiền mặt`, `Full - Chuyển khoản`, `Full - MoMo`, `Full - Visa/MC`, `Full` |
| 5 | `ngayGiaoDich` | TIMESTAMP | DEFAULT NOW() | Thời gian giao dịch |
| 6 | `trangThai` | VARCHAR(50) | DEFAULT 'Thành công' | Trạng thái: `Thành công`, `Chờ thanh toán`, `Chờ xác nhận`, `Đã hủy` |

**Lưu ý:** Một booking có thể có nhiều payment (cọc + thanh toán đầy đủ).

---

## 9. Bảng `reviews` - Đánh giá

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã đánh giá |
| 2 | `donDatId` | INTEGER | nullable, FK → bookings(id) | Đơn đặt liên quan (có thể null) |
| 3 | `nguoiDungId` | INTEGER | NOT NULL, FK → users(id) | Người đánh giá |
| 4 | `diemSao` | INTEGER | NOT NULL, CHECK (1-5) | Số sao (1-5) |
| 5 | `binhLuan` | TEXT | nullable | Nội dung bình luận |
| 6 | `ngayTao` | TIMESTAMP | DEFAULT NOW() | Ngày tạo đánh giá |
| 7 | `sanId` | INTEGER | nullable, FK → courts(id) | Sân được đánh giá (review sân không cần booking) |

**Lưu ý:** `donDatId` ban đầu là NOT NULL, sau được ALTER thành nullable để hỗ trợ đánh giá sân tự do.

---

## 10. Bảng `notifications` - Thông báo

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã thông báo |
| 2 | `nguoiDungId` | INTEGER | NOT NULL, FK → users(id) | Người nhận |
| 3 | `tieuDe` | VARCHAR(255) | NOT NULL | Tiêu đề thông báo |
| 4 | `noiDung` | TEXT | nullable | Nội dung chi tiết |
| 5 | `loaiThongBao` | VARCHAR(50) | DEFAULT 'system' | Loại thông báo (xem enum bên dưới) |
| 6 | `daDoc` | BOOLEAN | DEFAULT FALSE | Đã đọc hay chưa |
| 7 | `maDonDat` | INTEGER | nullable, FK → bookings(id) | Đơn đặt liên quan |
| 8 | `thoiGianTao` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |

**Các loại thông báo (`loaiThongBao`):**
`system`, `booking_confirmed`, `vip_auto_success`, `booking_completed`, `promotion`, `auto_checkin`, `auto_checkout`, `warning`, `booking_cancelled`, `noshow`, `auto_cancel`, `vip_auto_conflict`

---

## 11. Bảng `court_images` - Ảnh sân

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã ảnh |
| 2 | `sanId` | INTEGER | NOT NULL, FK → courts(id) ON DELETE CASCADE | Sân |
| 3 | `duongDanAnh` | VARCHAR(500) | NOT NULL | Đường dẫn ảnh |
| 4 | `isMain` | BOOLEAN | DEFAULT FALSE | Ảnh chính của sân |
| 5 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |

---

## 12. Bảng `discounts` - Mã giảm giá

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã discount |
| 2 | `code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã code |
| 3 | `noiDung` | VARCHAR(255) | nullable | Nội dung ngắn |
| 4 | `moTa` | TEXT | nullable | Mô tả chi tiết |
| 5 | `loaiGiamGia` | VARCHAR(50) | DEFAULT 'percentage' | Kiểu giảm: `percentage`, `fixed` |
| 6 | `mucGiamGia` | DECIMAL(15,2) | NOT NULL | Mức giảm (% hoặc số tiền) |
| 7 | `ngayBatDau` | TIMESTAMP | nullable | Ngày bắt đầu hiệu lực |
| 8 | `ngayKetThuc` | TIMESTAMP | nullable | Ngày hết hạn |
| 9 | `soLuongBanDau` | INTEGER | DEFAULT 0 | Tổng số lượng phát hành |
| 10 | `soLuongDaDung` | INTEGER | DEFAULT 0 | Số lượng đã sử dụng |
| 11 | `usage_limit_per_user` | INTEGER | DEFAULT 1 | Giới hạn lượt dùng/user |
| 12 | `giamToiDa` | DECIMAL(15,2) | nullable | Giảm tối đa (cho % discount) |
| 13 | `conditions` | JSONB | DEFAULT '{}' | Điều kiện áp dụng |
| 14 | `nguoiDungId` | INTEGER | nullable, FK → users(id) ON DELETE CASCADE | Gán riêng cho user (null = áp dụng chung) |
| 15 | `trangThai` | VARCHAR(50) | DEFAULT 'Active' | Trạng thái: `Active`, `Inactive` |
| 16 | `is_hidden` | BOOLEAN | DEFAULT FALSE | Ẩn khỏi danh sách public |
| 17 | `created_at` | TIMESTAMP | DEFAULT NOW() | Thời gian tạo |

**Cấu trúc `conditions` (JSONB):**
```json
{
  "target_audience": "new_user" | "vip",
  "min_order_value": 500000,
  "applicable_court_ids": [1, 2, 3]
}
```

**Quan hệ:** `discounts` **1 : N** `user_vouchers` (FK `discountId`, ON DELETE CASCADE)

---

## 13. Bảng `user_vouchers` - Voucher người dùng đã nhận

| # | Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|-----|-------------|-----------|-------|
| 1 | `id` | SERIAL | PRIMARY KEY | Mã dòng |
| 2 | `nguoiDungId` | INTEGER | NOT NULL, FK → users(id) ON DELETE CASCADE | Người dùng |
| 3 | `discountId` | INTEGER | NOT NULL, FK → discounts(id) ON DELETE CASCADE | Mã giảm giá |
| 4 | `claimedAt` | TIMESTAMP | DEFAULT NOW() | Thời gian nhận |
| 5 | `usedAt` | TIMESTAMP | nullable | Thời gian sử dụng |
| 6 | `trangThai` | VARCHAR(50) | DEFAULT 'Active' | Trạng thái: `Active`, `Used` |

**Ràng buộc:** `UNIQUE (nguoiDungId, discountId)` - mỗi user chỉ nhận 1 discount 1 lần.

---

## Tổng quan quan hệ

### Luồng chính (Core Flow)

```
users ──1:N──→ bookings ──1:N──→ booking_services ──N:1──→ services
  │                │
  │                ├──1:N──→ payments
  │                ├──1:N──→ reviews (nullable)
  │                └──1:N──→ notifications (nullable)
  │
  ├──1:N──→ reviews
  ├──1:N──→ notifications
  ├──1:N──→ auto_booking_series ──1:N──→ bookings (nullable)
  ├──1:N──→ discounts (nullable: gán riêng user)
  └──1:N──→ user_vouchers

courts ──1:N──→ timeslots ──1:N──→ bookings
  │
  ├──1:N──→ court_images (CASCADE)
  ├──1:N──→ bookings
  ├──1:N──→ auto_booking_series
  └──1:N──→ reviews (nullable, qua sanId)

discounts ──1:N──→ user_vouchers (CASCADE)
```

### Bảng nối (Junction Tables)

| Bảng nối | Bảng A | Bảng B | Ý nghĩa |
|----------|--------|--------|---------|
| `booking_services` | `bookings` | `services` | Dịch vụ kèm theo đơn đặt |
| `user_vouchers` | `users` | `discounts` | User nhận mã giảm giá |

### CASCADE Delete

| Bảng cha | Bảng con | Ý nghĩa |
|----------|----------|---------|
| `courts` | `timeslots` | Xóa sân → xóa tất cả khung giờ của sân |
| `courts` | `court_images` | Xóa sân → xóa tất cả ảnh của sân |
| `bookings` | `booking_services` | Xóa đơn → xóa dịch vụ kèm theo |
| `bookings` | `payments` | Xóa đơn → xóa lịch sử thanh toán |
| `users` | `user_vouchers` | Xóa user → xóa voucher đã nhận |
| `discounts` | `user_vouchers` | Xóa discount → xóa voucher liên quan |

### Optional (Nullable) Foreign Keys

| Bảng | FK | Lý do nullable |
|------|-----|----------------|
| `bookings` | `autoBookingSeriesId` | Chỉ set khi là đơn auto-booking |
| `reviews` | `donDatId` | Cho phép review sân không cần booking |
| `reviews` | `sanId` | Review có thể gắn với sân hoặc không |
| `notifications` | `maDonDat` | Thông báo hệ thống không cần booking |
| `discounts` | `nguoiDungId` | Null = discount áp dụng chung, có giá trị = gán riêng user |

---

## Indexes

| Bảng | Tên Index | Cột | Mục đích |
|------|-----------|-----|----------|
| `bookings` | `idx_bookings_auto_series` | `autoBookingSeriesId` | Truy vấn các đơn trong cùng series auto-booking |
| `auto_booking_series` | `idx_auto_booking_series_user_status` | `(nguoiDungId, trangThai)` | Tìm series active của user |

---

## Business Rules & Constraints

1. **Trạng thái booking**: Chỉ chuyển tiếp theo luồng (`Đã cọc` → `Đã đặt` → `Đã thanh toán` → `Đang sử dụng` → `Hoàn thành`). Có thể hủy ở bất kỳ trạng thái nào.
2. **Auto-booking (VIP)**: User VIP tạo `auto_booking_series` với `startDate` đến `endDate`. Cron job scheduler tạo `bookings` tự động trong khoảng thời gian.
3. **Discount**: Có 2 kiểu: `percentage` (% giảm, có `giamToiDa`) và `fixed` (giảm số tiền cố định). Có thể giới hạn theo `target_audience`, `min_order_value`, `applicable_court_ids`.
4. **User voucher**: Mỗi user chỉ claim 1 discount 1 lần (`UNIQUE` constraint). State machine: `Active` → `Used`.
5. **Sân & khung giờ**: Mỗi sân có thể có nhiều khung giờ với giá khác nhau. Khi xóa sân, tất cả khung giờ liên quan bị xóa (CASCADE).
6. **Service inventory**: `soLuongTon` trong `services` theo dõi tồn kho, có thể hết hàng (`trangThai = 'Hết hàng'`).
