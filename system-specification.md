# Pickleball Booking System - Đặc Tả Hệ Thống

## 1. USE CASE DIAGRAM

### 1.1 Actors

| Actor | Vai trò | Mô tả |
|-------|---------|-------|
| **Khách vãng lai** | Xem sân, chưa đăng ký | Người ghé thăm, chưa có tài khoản |
| **Customer** | Người dùng đã đăng nhập | Đặt sân, hủy đặt, xem lịch sử, đánh giá |
| **VIP Customer** | Customer có isVIP=true | Tự động đặt sân định kỳ, ưu đãi riêng |
| **Admin** | Quản trị viên | Toàn quyền quản lý hệ thống |
| **System** | Cron jobs, scheduler | Tự động checkout, no-show, auto-booking |

### 1.2 Use Case Tổng Quan

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        PICKLEBALL BOOKING SYSTEM                          │
│                                                                           │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────┐   │
│  │         KHÁCH VÃNG LAI          │   │           CUSTOMER           │   │
│  │  • Đăng ký tài khoản            │   │  • Đăng nhập / Đăng xuất    │   │
│  │  • Xem danh sách sân            │   │  • Xem hồ sơ cá nhân        │   │
│  │  • Xem chi tiết sân             │   │  • Cập nhật hồ sơ           │   │
│  │  • Xem khung giờ trống          │   │  • Đặt sân (chọn dịch vụ)   │   │
│  │  • Xem đánh giá sân             │   │  • Hủy đơn đặt              │   │
│  │  • Quên mật khẩu                │   │  • Xem lịch sử đặt sân      │   │
│  │                                 │   │  • Xem chi tiết đơn         │   │
│  │                                 │   │  • Tạo mã QR check-in       │   │
│  └─────────────────────────────────┘   │  • Nhận mã giảm giá          │   │
│                                          │  • Đánh giá sân             │   │
│  ┌─────────────────────────────────┐   │  • Xem voucher của tôi       │   │
│  │         VIP CUSTOMER            │   │  • Xem thông báo             │   │
│  │  (extends Customer)             │   └─────────────────────────────┘   │
│  │  • Đặt sân tự động định kỳ     │                                       │
│  │  • Hủy chuỗi auto-booking       │   ┌─────────────────────────────┐   │
│  │                                 │   │            ADMIN             │   │
│  └─────────────────────────────────┘   │  • Dashboard thống kê        │   │
│                                          │  • Quản lý sân (CRUD)       │   │
│  ┌─────────────────────────────────┐   │  • Quản lý ảnh sân           │   │
│  │            SYSTEM               │   │  • Quản lý khung giờ (CRUD)  │   │
│  │  • Auto checkout (mỗi phút)     │   │  • Quản lý đơn đặt sân       │   │
│  │  • Auto no-show (mỗi phút)      │   │  • Check-in / Check-out      │   │
│  │  • Payment timeout (mỗi phút)   │   │  • Đánh dấu no-show          │   │
│  │  • Auto cancel past (hàng ngày) │   │  • Quét mã QR check-in       │   │
│  │  • VIP auto-booking (hàng tuần) │   │  • Quản lý dịch vụ (CRUD)    │   │
│  │  • Loyalty rewards (trigger)    │   │  • Quản lý mã giảm giá       │   │
│  │  • Send notifications           │   │  • Quản lý người dùng        │   │
│  └─────────────────────────────────┘   │  • Khóa/Mở khóa tài khoản    │   │
│                                          │  • Bật/Tắt VIP cho user     │   │
│                                          │  • Xem báo cáo doanh thu    │   │
│                                          │  • Xuất Excel báo cáo       │   │
│                                          │  • Xem schedule board        │   │
│                                          │  • Xóa đánh giá             │   │
│                                          │  • Gửi thông báo            │   │
│                                          └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Danh Sách Use Case Chi Tiết

#### UC-01: Đăng ký tài khoản
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Khách vãng lai |
| Mô tả | Người dùng tạo tài khoản mới qua email |
| Pre-condition | User chưa có tài khoản |
| Post-condition | Tài khoản được tạo, nhận mã WELCOME 20%, JWT được cấp |
| Trigger | User chọn "Đăng ký" |
| Basic Flow | 1. User nhập họ tên, email, password, số điện thoại → 2. Hệ thống gửi OTP 6 số qua email → 3. User nhập OTP → 4. Hệ thống hash password, tạo user, tạo mã WELCOME{userId} 20% (30 ngày), cấp JWT |
| Exception | Email/số điện thoại đã tồn tại → báo lỗi; OTP sai/hết hạn → yêu cầu nhập lại hoặc gửi OTP mới |

#### UC-02: Đăng nhập
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Customer, Admin |
| Mô tả | Xác thực và nhận JWT token |
| Pre-condition | Đã có tài khoản |
| Post-condition | Có JWT token, vào trang chính |
| Basic Flow | 1. User nhập email, password → 2. Hệ thống xác thực bcrypt, kiểm tra không bị Locked → 3. Cấp JWT (7 ngày) |
| Exception | Sai password 5 lần/phút → bị chặn tạm thời; Tài khoản bị Locked → từ chối đăng nhập |

#### UC-03: Xem danh sách sân & khung giờ
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Khách vãng lai, Customer |
| Mô tả | Tìm kiếm và xem thông tin sân, khung giờ còn trống |
| Pre-condition | Không |
| Post-condition | Hiển thị danh sách sân + khung giờ khả dụng |
| Basic Flow | 1. User vào danh sách sân → 2. Hệ thống hiển thị sân (tên, ảnh, đánh giá, số slot) → 3. User chọn sân → 4. Chọn ngày → 5. Hệ thống hiển thị khung giờ (đánh dấu đã đặt, đã hết hạn) |
| Business Rule | Không hiển thị sân "Ẩn"/"Bảo trì"; Khóa slot trước giờ bắt đầu 15 phút |

#### UC-04: Đặt sân
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Customer |
| Mô tả | Đặt sân với khung giờ và dịch vụ kèm theo |
| Pre-condition | Đã đăng nhập, chọn sân + khung giờ + ngày |
| Post-condition | Đơn đặt được tạo, payment được ghi nhận |
| Trigger | User bấm "Đặt sân" |
| Basic Flow | 1. User chọn sân, ngày, khung giờ → 2. Chọn dịch vụ kèm theo (nếu có) → 3. Nhập mã giảm giá (nếu có) → 4. Hệ thống tính tổng tiền → 5. Chọn phương thức thanh toán → 6. Tạo booking + payment |
| Exception | Khung giờ đã có người đặt → báo lỗi; Slot đã qua giờ → từ chối; Mã giảm giá không hợp lệ → báo lý do cụ thể |
| Business Rule | Xử lý trong TRANSACTION với SELECT FOR UPDATE chống race condition |

#### UC-05: Hủy đơn đặt
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Customer |
| Mô tả | Hủy đơn đặt đã tạo |
| Pre-condition | Đã đăng nhập, là chủ đơn, booking không ở trạng thái cuối |
| Post-condition | Booking → "Đã hủy", hoàn stock dịch vụ, hoàn trạng thái voucher |
| Basic Flow | 1. User xem chi tiết đơn → 2. Bấm "Hủy đặt" → 3. Hệ thống kiểm tra 3h rule → 4. Xác nhận hủy → 5. Cập nhật trạng thái, gửi thông báo |
| Exception | Còn dưới 3h trước giờ chơi → từ chối hủy; Đơn đã ở trạng thái cuối → từ chối |
| Business Rule | Phải hủy >= 3 tiếng trước giờ bắt đầu; Hoàn stock dịch vụ; Kích hoạt lại voucher nếu có dùng |

#### UC-06: Check-in
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin |
| Mô tả | Xác nhận khách đến sân, chuyển trạng thái booking |
| Pre-condition | Admin đã đăng nhập, booking chưa check-in, là ngày hôm nay |
| Post-condition | Booking → "Đang sử dụng", payment → "Thành công" |
| Basic Flow | 1. Admin tìm đơn (theo tên, mã đơn, hoặc quét QR) → 2. Bấm "Check-in" → 3. Hệ thống kiểm tra trong 30 phút trước giờ bắt đầu → 4. Xác nhận check-in → 5. Cập nhật trạng thái, gửi thông báo |
| Exception | Quá thời gian check-in (30 phút trước giờ) → từ chối; Không phải hôm nay → từ chối |
| Business Rule | Chỉ check-in được trong khoảng 30 phút trước giờ bắt đầu, đúng ngày |

#### UC-07: Check-out
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin, System (auto) |
| Mô tả | Kết thúc phiên chơi |
| Pre-condition | Booking đang ở "Đang sử dụng" |
| Post-condition | Booking → "Hoàn thành", kiểm tra loyalty reward |
| Trigger | Admin bấm "Check-out" hoặc cron job auto checkout |
| Basic Flow | 1. Admin tìm đơn → 2. Bấm "Check-out" → 3. Hệ thống cập nhật trạng thái → 4. checkAndRewardLoyalty: nếu đủ 3 lần hoàn thành → tặng mã LTY10-XXXX 10% |
| Exception | Booking không ở "Đang sử dụng" → từ chối |

#### UC-08: Quản lý sân & khung giờ
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin |
| Mô tả | CRUD sân, khung giờ, ảnh |
| Basic Flow | 1. Admin thêm/sửa/xóa sân → 2. Upload ảnh sân → 3. Quản lý khung giờ theo từng sân → 4. Xóa sân = soft delete ("Ẩn") |
| Business Rule | Xóa sân "Ẩn" → hủy auto_booking_series liên quan; force=true → hủy cả future bookings; Không xóa khung giờ nếu có future booking |

#### UC-09: Quản lý mã giảm giá
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin |
| Mô tả | Tạo, sửa, xóa discount codes |
| Business Rule | 2 loại: percentage (có giới hạn giamToiDa) và fixed; Điều kiện lọc: target_audience (new_user/vip), min_order_value, applicable_court_ids; is_hidden = ẩn khỏi public; Có thể gán riêng cho 1 user qua nguoiDungId |

#### UC-10: Đánh giá sân
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Customer |
| Mô tả | Đánh giá sao + bình luận về sân |
| Pre-condition | Đã đăng nhập |
| Post-condition | Review được tạo |
| Basic Flow | 1. User vào trang sân → 2. Chọn số sao (1-5), nhập bình luận → 3. Gửi đánh giá |
| Business Rule | Có 2 chế độ: (A) qua booking: chỉ review booking đã "Hoàn thành", 1 review/booking; (B) trực tiếp: tối đa 1 review/24h cho mỗi sân |

#### UC-11: Quản lý người dùng
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin |
| Mô tả | Xem, sửa, khóa/mở khóa, bật/tắt VIP user |
| Business Rule | Lock user → hủy tất cả future bookings + deactivate auto_booking_series; Toggle VIP ON → tặng mã VIP15 15% (max 200k), gửi thông báo; Toggle VIP OFF → dừng auto_booking_series, hủy future auto-bookings |

#### UC-12: Đặt sân tự động (VIP)
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | VIP Customer, System |
| Mô tả | Tạo chuỗi đặt sân tự động trong 30 ngày |
| Basic Flow | 1. VIP chọn sân, khung giờ, ngày bắt đầu/kết thúc, dịch vụ → 2. Hệ thống tạo auto_booking_series → 3. Tạo ngay 4 bookings cho 4 tuần trong transaction → 4. Các đơn ở trạng thái "Đã cọc" (10% deposit) |
| Business Rule | System cron job: mỗi thứ 2 00:01 kiểm tra và tạo booking tuần mới; Auto cancel nếu quá ngày chưa xử lý |

#### UC-13: Xem báo cáo & Dashboard
| Thuộc tính | Giá trị |
|-----------|---------|
| Actor | Admin |
| Mô tả | Xem thống kê, biểu đồ doanh thu, xuất Excel |
| Basic Flow | 1. Admin vào Dashboard → 2. Xem tổng quan (sân, user, booking hôm nay, doanh thu tháng) → 3. Xem biểu đồ doanh thu 7 ngày → 4. Vào Reports → 5. Lọc theo khoảng ngày → 6. Xem doanh thu theo sân, theo ngày → 7. Xuất Excel |

---

## 2. ACTIVITY DIAGRAMS

### 2.1 Activity: Đặt sân (UC-04)

```
┌──────────────────────────────────────────────────────┐
│                    BẮT ĐẦU                            │
│                       │                               │
│                       ▼                               │
│            ┌──────────────────┐                       │
│            │  Chọn sân & ngày  │                       │
│            └────────┬─────────┘                       │
│                     │                                 │
│                     ▼                                 │
│            ┌──────────────────┐                       │
│            │ Hiển thị khung    │◄────────┐            │
│            │ giờ khả dụng      │          │            │
│            └────────┬─────────┘          │            │
│                     │                    │            │
│                     ▼                    │            │
│            ┌──────────────────┐          │            │
│            │ Chọn khung giờ   │          │            │
│            └────────┬─────────┘          │            │
│                     │                    │            │
│                     ▼                    │            │
│            ┌──────────────────┐          │            │
│            │ Muốn thêm dịch vụ?│          │            │
│            └────┬─────────┬───┘          │            │
│                 │ Yes     │ No            │            │
│                 ▼         │               │            │
│            ┌──────────┐   │               │            │
│            │Chọn dịch vụ│   │               │            │
│            └────┬─────┘   │               │            │
│                 │         │               │            │
│                 └────┬────┘               │            │
│                      ▼                    │            │
│            ┌──────────────────┐          │            │
│            │ Có mã giảm giá?   │          │            │
│            └────┬─────────┬───┘          │            │
│                 │ Yes     │ No            │            │
│                 ▼         │               │            │
│            ┌──────────────────┐          │            │
│            │ Nhập & validate   │          │            │
│            │ mã giảm giá       │──────────┤            │
│            └────────┬─────────┘ invalid   │            │
│                     │ valid               │            │
│                     │                     │            │
│                     └────┬────┘            │            │
│                          ▼                │            │
│            ┌──────────────────────────┐   │            │
│            │ Hiển thị tổng tiền:       │   │            │
│            │ Giá sân + Dịch vụ - Giảm  │   │            │
│            └────────────┬─────────────┘   │            │
│                         │                 │            │
│                         ▼                 │            │
│            ┌──────────────────────────┐   │            │
│            │ Chọn phương thức TT:      │   │            │
│            │ Tiền mặt / CK / MoMo /    │   │            │
│            │ Visa                      │   │            │
│            └────────────┬─────────────┘   │            │
│                         │                 │            │
│                         ▼                 │            │
│            ┌──────────────────────────┐   │            │
│            │  [TRANSACTION]             │   │            │
│            │  ┌──────────────────────┐ │   │            │
│            │  │SELECT FOR UPDATE slot│ │   │            │
│            │  │Kiểm tra conflict     │ │   │            │
│            │  │Tạo booking           │ │   │            │
│            │  │Tạo payment           │ │   │            │
│            │  │Trừ stock dịch vụ     │ │   │            │
│            │  │Đánh dấu voucher used │ │   │            │
│            │  └──────────────────────┘ │   │            │
│            └────────────┬─────────────┘   │            │
│                         │                 │            │
│              ┌──────────┴──────────┐      │            │
│              │                     │      │            │
│              ▼                     ▼      │            │
│       ┌────────────┐       ┌────────────┐ │            │
│       │   THÀNH CÔNG│       │  THẤT BẠI   │─┤            │
│       │  • Gửi tbáo  │       │  • Rollback │ │            │
│       │  • Redirect  │       │  • Báo lỗi  │ │            │
│       └──────┬─────┘       └──────┬─────┘ │            │
│              │                     │       │            │
│              ▼                     └───┬───┘            │
│       ┌────────────┐                  │                │
│       │   KẾT THÚC  │◄─────────────────┘                │
│       └────────────┘                                   │
└──────────────────────────────────────────────────────┘
```

### 2.2 Activity: Luồng trạng thái Booking (State Machine)

```
                        ┌─────────────┐
                        │  ĐẶT SÂN     │
                        └──────┬──────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                    ▼          ▼          ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Đã cọc   │ │  Đã đặt   │ │Đã thanh  │
              │ (VIP 10%) │ │ (tiền mặt)│ │  toán    │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │            │            │
                   │     ┌──────┴──────┐     │
                   │     │             │     │
         ┌─────────┼─────┼──┐      ┌──┼─────┼─────────┐
         │         │     │  │      │  │     │         │
         ▼         ▼     ▼  ▼      ▼  ▼     ▼         ▼
    ┌────────┐                               ┌──────────┐
    │Check-in│                               │   HỦY    │
    │ (Admin)│                               │  ┌─────┐ │
    └───┬────┘                               │  │User │ │
        │                                    │  │cancel│ │
        ▼                                    │  ├─────┤ │
    ┌──────────┐                             │  │No-   │ │
    │  Đang    │                             │  │show  │ │
    │ sử dụng  │                             │  ├─────┤ │
    └────┬─────┘                             │  │System│ │
         │                                   │  │change│ │
         ├──────────────┐                    │  ├─────┤ │
         ▼              ▼                    │  │Paymt │ │
    ┌──────────┐  ┌──────────┐              │  │timeout│ │
    │Check-out │  │  Auto    │              │  └─────┘ │
    │ (Admin)  │  │checkout  │              └──────────┘
    └────┬─────┘  │ (cron)   │
         │        └────┬─────┘
         │             │
         └──────┬──────┘
                ▼
         ┌──────────┐
         │  Hoàn    │──────► checkAndRewardLoyalty()
         │  thành   │        (mỗi 3 lần → tặng mã 10%)
         └──────────┘
```

### 2.3 Activity: Cron Job - Auto Checkout & No-show

```
┌───────────────────────────────────────────────────┐
│         CHẠY MỖI PHÚT (* * * * *)                 │
│                       │                            │
│                       ▼                            │
│          ┌────────────────────────┐               │
│          │  handleBookingStatus()  │               │
│          └────────────┬───────────┘               │
│                       │                            │
│     ┌─────────────────┼─────────────────┐         │
│     ▼                 ▼                  ▼         │
│ ┌────────────┐  ┌──────────────┐  ┌────────────┐ │
│ │Auto        │  │Payment       │  │Auto         │ │
│ │checkout    │  │timeout       │  │no-show      │ │
│ └─────┬──────┘  └──────┬───────┘  └──────┬─────┘ │
│       │                │                 │        │
│       ▼                ▼                 ▼        │
│ ┌────────────┐  ┌──────────────┐  ┌────────────┐ │
│ │Tìm booking │  │Tìm booking   │  │Tìm booking  │ │
│ │"Đang sử    │  │"Đã cọc" có   │  │"Đã thanh    │ │
│ │dụng" có    │  │payment "Chờ  │  │toán"/"Đã đặt│ │
│ │current_time│  │thanh toán" > │  │"/"Đã cọc" có│ │
│ │>= end_time │  │15 phút       │  │current_time │ │
│ └─────┬──────┘  └──────┬───────┘  │>= start_time│ │
│       │                │          │+ 15 phút    │ │
│       ▼                ▼          └──────┬─────┘ │
│ ┌────────────┐  ┌──────────────┐         │        │
│ │FOR EACH    │  │FOR EACH      │         ▼        │
│ │booking:    │  │booking:      │  ┌────────────┐ │
│ │•status =   │  │•cancelWith   │  │FOR EACH    │ │
│ │ "Hoàn thành"│  │ Reason(      │  │booking:    │ │
│ │•payment =  │  │ PAYMENT_     │  │•cancelWith │ │
│ │ "Thành công"│  │ TIMEOUT)     │  │ Reason(    │ │
│ │•loyalty    │  └──────────────┘  │ AUTO_      │ │
│ │ check      │                    │ NOSHOW)    │ │
│ └────────────┘                    └────────────┘ │
└───────────────────────────────────────────────────┘
```

### 2.4 Activity: VIP Auto-booking

```
┌─────────────────────────────────────────────────────────┐
│          VIP TẠO AUTO-BOOKING SERIES                      │
│                          │                                │
│                          ▼                                │
│    ┌──────────────────────────────────────────┐          │
│    │ Chọn: sân, khung giờ (nhiều), ngày bắt    │          │
│    │ đầu, ngày kết thúc, dịch vụ kèm theo      │          │
│    └────────────────────┬─────────────────────┘          │
│                         │                                │
│                         ▼                                │
│    ┌──────────────────────────────────────────┐          │
│    │ [TRANSACTION]                              │          │
│    │ 1. Tạo auto_booking_series record          │          │
│    │ 2. buildWeeklyDates (4 tuần = 4 ngày)      │          │
│    │ 3. FOR EACH date + khungGioId:             │          │
│    │    • SELECT FOR UPDATE check conflict       │          │
│    │    • Tạo booking (trangThai="Đã cọc",      │          │
│    │      tienDaCoc=10%, isAutoBooking=TRUE)     │          │
│    │    • Tạo payment ("Chờ thanh toán")         │          │
│    └────────────────────┬─────────────────────┘          │
│                         │                                │
│                         ▼                                │
│    ┌──────────────────────────────────────────┐          │
│    │  Gửi thông báo "vip_auto_success"          │          │
│    │  Redirect về danh sách đơn                 │          │
│    └──────────────────────────────────────────┘          │
│                                                          │
│  ═══════════════════════════════════════════════════════ │
│                                                          │
│          SYSTEM: XỬ LÝ AUTO-BOOKING HÀNG TUẦN            │
│          (Chạy thứ 2 hàng tuần lúc 00:01)                │
│                                                          │
│    ┌──────────────────────────────────────────┐          │
│    │  processVipAutoBooking()                   │          │
│    │  • Legacy: xử lý user có isAutoBooking=TRUE│          │
│    │  • Tìm booking cuối cùng của VIP → tính    │          │
│    │    ngày tiếp theo (+7 ngày)                │          │
│    │  • Kiểm tra conflict + sân không "Ẩn"/     │          │
│    │    "Bảo trì"                                │          │
│    │  • Có conflict → disable auto + thông báo   │          │
│    │  • Không conflict → tạo booking mới         │          │
│    └──────────────────────────────────────────┘          │
│                                                          │
│  ═══════════════════════════════════════════════════════ │
│                                                          │
│          SYSTEM: AUTO CANCEL PAST BOOKINGS                │
│          (Chạy hàng ngày lúc 00:05)                      │
│                                                          │
│    ┌──────────────────────────────────────────┐          │
│    │  autoCancelPastBookings()                  │          │
│    │  • Tìm auto-booking có ngayChoi < today    │          │
│    │    và status NOT IN ("Đã hủy","Hoàn thành",│          │
│    │    "Đang sử dụng")                          │          │
│    │  • Cancel với lý do AUTO_BOOKING_EXPIRED    │          │
│    └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

### 2.5 Activity: Loyalty Rewards

```
┌────────────────────────────────────────────────┐
│    CHECKOUT / AUTO-CHECKOUT THÀNH CÔNG          │
│                    │                            │
│                    ▼                            │
│    ┌─────────────────────────────┐             │
│    │ checkAndRewardLoyalty(userId)│             │
│    └────────────┬────────────────┘             │
│                 │                               │
│                 ▼                               │
│    ┌─────────────────────────────┐             │
│    │ Đếm số booking "Hoàn thành"  │             │
│    │ của user                     │             │
│    └────────────┬────────────────┘             │
│                 │                               │
│                 ▼                               │
│    ┌─────────────────────────────┐             │
│    │ count % 3 === 0 ?           │             │
│    └────┬──────────────────┬─────┘             │
│         │ Yes              │ No                │
│         ▼                  ▼                   │
│    ┌──────────────┐  ┌──────────────┐         │
│    │ Tạo discount  │  │   KẾT THÚC    │         │
│    │ code:         │  └──────────────┘         │
│    │ LTY10-XXXX    │                           │
│    │ 10%, personal │                           │
│    │ valid → 2026  │                           │
│    └──────┬───────┘                           │
│           │                                    │
│           ▼                                    │
│    ┌──────────────┐                           │
│    │ Gửi thông báo │                           │
│    │ cho user +    │                           │
│    │ admin         │                           │
│    └──────┬───────┘                           │
│           │                                    │
│           ▼                                    │
│    ┌──────────────┐                           │
│    │   KẾT THÚC    │                           │
│    └──────────────┘                           │
└────────────────────────────────────────────────┘
```

---

## 3. SEQUENCE DIAGRAMS

### 3.1 Sequence: Đăng ký & Xác thực OTP

```
User          Frontend        API Server         PostgreSQL      OTP Store (Mem)
 │               │                │                    │               │
 │ POST /register│                │                    │               │
 │──────────────>│                │                    │               │
 │               │ POST /api/auth/│                    │               │
 │               │   register     │                    │               │
 │               │───────────────>│                    │               │
 │               │                │ Validate input     │               │
 │               │                │ Check email unique─>│              │
 │               │                │<──────ok──────────│               │
 │               │                │ Gen OTP 6 số       │               │
 │               │                │────────────────────────────────────>│
 │               │                │ Store(email,otp,type,ttl=10min)     │
 │               │                │<────────────────────────────────────│
 │               │    201 OK      │                    │               │
 │               │<───────────────│                    │               │
 │    Gửi OTP    │                │                    │               │
 │<──────────────│                │                    │               │
 │               │                │                    │               │
 │ Nhập OTP      │                │                    │               │
 │──────────────>│                │                    │               │
 │               │ POST /api/auth/│                    │               │
 │               │ verify-register│                    │               │
 │               │───────────────>│                    │               │
 │               │                │ Lookup OTP ──────────────────────>│
 │               │                │<───────otp data────────────────────│
 │               │                │ Verify OTP match                   │
 │               │                │ bcrypt.hash(password, 10)          │
 │               │                │ INSERT user ───────>│             │
 │               │                │<───────user_id─────│              │
 │               │                │ Tạo WELCOME{id} 20%──>│           │
 │               │                │<───────ok──────────│              │
 │               │                │ Tạo JWT (7 ngày)   │               │
 │               │                │ Xóa OTP ──────────────────────────>│
 │               │   200 + JWT    │                    │               │
 │               │<───────────────│                    │               │
 │    Redirect   │                │                    │               │
 │<──────────────│                │                    │               │
```

### 3.2 Sequence: Đặt sân (Happy Path)

```
User        Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Chọn sân+ngày│            │                    │
 │────────────>│             │                    │
 │             │ GET /api/courts/:id/timeslots?date=YYYY-MM-DD
 │             │─────────────────────────────>   │
 │             │             │ Query slots ──────>│
 │             │             │ + check isBooked   │
 │             │             │<──────slots────────│
 │             │  200 + slots│                    │
 │             │<─────────────────────────────    │
 │             │             │                    │
 │ Chọn slot+dịch vụ+mã GG│  │                    │
 │────────────>│             │                    │
 │             │ POST /api/admin/discounts/validate
 │             │─────────────────────────────>   │
 │             │             │ Validate mã GG ────>│
 │             │             │<───discountAmount──│
 │             │  200 + OK   │                    │
 │             │<─────────────────────────────    │
 │             │             │                    │
 │ Bấm "Đặt sân"│            │                    │
 │────────────>│             │                    │
 │             │ POST /api/bookings
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ ╔══ TRANSACTION ═══╗
 │             │             │ ║ Validate court   ║
 │             │             │ ║ SELECT FOR UPDATE║──>│
 │             │             │ ║ conflicts ───────║──>│
 │             │             │ ║<──no conflict────║──│
 │             │             │ ║ INSERT booking ──║──>│
 │             │             │ ║ INSERT booking_   ║   │
 │             │             │ ║   services ───────║──>│
 │             │             │ ║ INSERT payment ───║──>│
 │             │             │ ║ UPDATE service     ║   │
 │             │             │ ║   stock ──────────║──>│
 │             │             │ ║ UPDATE discount    ║   │
 │             │             │ ║   usage ──────────║──>│
 │             │             │ ║ SEND notifications ║   │
 │             │             │ ╚════════════════════╝   │
 │             │             │                    │
 │             │ 201 + booking│                   │
 │             │<─────────────────────────────    │
 │ Redirect ×em│             │                    │
 │<────────────│             │                    │
```

### 3.3 Sequence: Hủy đơn (User Cancel)

```
User        Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Xem chi tiết │            │                    │
 │────────────>│             │                    │
 │             │ GET /api/bookings/:id
 │             │─────────────────────────────>   │
 │             │             │ Query booking ─────>│
 │             │             │ (owner check)      │
 │             │             │<──────data─────────│
 │             │  200 + data │                    │
 │             │<─────────────────────────────    │
 │             │             │                    │
 │ Bấm "Hủy đặt"│            │                    │
 │────────────>│             │                    │
 │             │ POST /api/bookings/:id/cancel
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ Check: owner?      │
 │             │             │ Check: status hợp lệ?│
 │             │             │ Check: 3h rule?    │
 │             │             │ (now + 3h < start) │
 │             │             │                    │
 │             │             │ cancelBookingWithReason(USER_CANCEL):
 │             │             │ ┌─────────────────┐│
 │             │             │ │UPDATE booking    ││
 │             │             │ │status='Đã hủy'   ││
 │             │             │ │ghiChu='khách hủy'││
 │             │             │ │UPDATE payment    ││
 │             │             │ │status='Đã hủy'   ││
 │             │             │ │UPDATE services   ││
 │             │             │ │ stock +1 ────────>││
 │             │             │ │UPDATE discount   ││
 │             │             │ │ count -1 ────────>││
 │             │             │ │UPDATE voucher    ││
 │             │             │ │ status='Active' ─>││
 │             │             │ │INSERT notification││
 │             │             │ │ (user + admins)  ││
 │             │             │ └─────────────────┘│
 │             │             │                    │
 │             │ 200 OK      │                    │
 │             │<─────────────────────────────    │
 │ Cập nhật UI │             │                    │
 │<────────────│             │                    │
```

### 3.4 Sequence: Check-in (Admin)

```
Admin       Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Mở danh sách│             │                    │
 │ booking     │             │                    │
 │────────────>│             │                    │
 │             │ GET /api/bookings?status=...
 │             │─────────────────────────────>   │
 │             │             │ Query ─────────────>│
 │             │<────────────│                    │
 │             │             │                    │
 │ (Hoặc quét QR)            │                    │
 │────────────>│             │                    │
 │             │ GET /api/bookings/:id/qr
 │             │─────────────────────────────>   │
 │             │             │ Gen QR (booking ID)│
 │             │<───base64 PNG────────────────    │
 │ Quét → giải │             │                    │
 │ mã booking ID│            │                    │
 │────────────>│             │                    │
 │             │             │                    │
 │ Bấm "Check-in"│           │                    │
 │────────────>│             │                    │
 │             │ POST /api/bookings/:id/checkin
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ Check: is today?   │
 │             │             │ Check: now >=      │
 │             │             │   start - 30 min?  │
 │             │             │ Check: status in   │
 │             │             │   (Đã cọc,Đã đặt,  │
 │             │             │    Đã thanh toán)? │
 │             │             │                    │
 │             │             │ UPDATE booking     │
 │             │             │   status='Đang sử  │
 │             │             │   dụng' ──────────>│
 │             │             │ UPDATE payment     │
 │             │             │   status='Thành    │
 │             │             │   công' ──────────>│
 │             │             │ INSERT notification│
 │             │             │   (auto_checkin)   │
 │             │             │                    │
 │             │ 200 OK      │                    │
 │             │<─────────────────────────────    │
 │ Cập nhật UI │             │                    │
 │<────────────│             │                    │
```

### 3.5 Sequence: VIP Auto-booking Series

```
VIP User    Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Chọn sân,   │             │                    │
 │ khung giờ,  │             │                    │
 │ start/end   │             │                    │
 │────────────>│             │                    │
 │             │             │                    │
 │ Bấm "Đặt tự  │            │                    │
 │  động"      │             │                    │
 │────────────>│             │                    │
 │             │ POST /api/bookings
 │             │ (isAutoBooking=true)
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ ╔══ TRANSACTION ═══╗
 │             │             │ ║1. Validate input  ║
 │             │             │ ║2. INSERT auto_    ║
 │             │             │ ║   booking_series──║──>│
 │             │             │ ║3. buildWeeklyDates║   │
 │             │             │ ║   (4 tuần=4 ngày) ║   │
 │             │             │ ║4. FOR EACH date+  ║   │
 │             │             │ ║   khungGioID:     ║   │
 │             │             │ ║   ┌──────────────┐║   │
 │             │             │ ║   │SELECT FOR     │║   │
 │             │             │ ║   │UPDATE conflict│║──>│
 │             │             │ ║   │check ────────>│║   │
 │             │             │ ║   │INSERT booking │║──>│
 │             │             │ ║   │(Đã cọc,10%)   │║   │
 │             │             │ ║   │INSERT payment │║──>│
 │             │             │ ║   │(Chờ thanh toán│║   │
 │             │             │ ║   └──────────────┘║   │
 │             │             │ ║5. COMMIT if all ok ║   │
 │             │             │ ║6. Gửi tbáo vip_   ║   │
 │             │             │ ║   auto_success    ║   │
 │             │             │ ╚════════════════════╝   │
 │             │             │                    │
 │             │ 201 + series│                    │
 │             │<─────────────────────────────    │
 │ Redirect    │             │                    │
 │<────────────│             │                    │
```

### 3.6 Sequence: Toggle VIP (Admin)

```
Admin       Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Users page  │             │                    │
 │────────────>│             │                    │
 │             │ GET /api/users
 │             │─────────────────────────────>   │
 │             │<────200──────────────────────    │
 │             │             │                    │
 │ Bấm "Toggle │             │                    │
 │  VIP"       │             │                    │
 │────────────>│             │                    │
 │             │ PATCH /api/users/:id/toggle-vip
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ [IF enabling VIP]  │
 │             │             │ ┌─────────────────┐│
 │             │             │ │UPDATE user       ││
 │             │             │ │    isVIP=TRUE ───>││
 │             │             │ │Tạo VIP15 mã GG   ││
 │             │             │ │  (15%,max 200k,  ││
 │             │             │ │   30 ngày) ──────>││
 │             │             │ │INSERT noti       ││
 │             │             │ │  (promotion)      ││
 │             │             │ └─────────────────┘│
 │             │             │                    │
 │             │             │ [IF disabling VIP] │
 │             │             │ ┌─────────────────┐│
 │             │             │ │UPDATE user       ││
 │             │             │ │    isVIP=FALSE ──>││
 │             │             │ │UPDATE auto_      ││
 │             │             │ │  booking_series  ││
 │             │             │ │  status=Inactive─>││
 │             │             │ │CANCEL future     ││
 │             │             │ │  auto-bookings ──>││
 │             │             │ │  (SYSTEM_CHANGE) ││
 │             │             │ └─────────────────┘│
 │             │             │                    │
 │             │ 200 OK      │                    │
 │             │<─────────────────────────────    │
 │ Cập nhật row│             │                    │
 │<────────────│             │                    │
```

### 3.7 Sequence: Cron Job Hàng Phút (Auto Checkout + No-show + Payment Timeout)

```
 Cron (System)              API Server              PostgreSQL
       │                        │                        │
       │ * * * * * (mỗi phút)   │                        │
       │───────────────────────>│                        │
       │                        │                        │
       │       handleBookingStatus()                      │
       │                        │                        │
       │  ┌─────────────────────────────────────────────┐│
       │  │ 1. AUTO CHECKOUT                            ││
       │  │ ─────────────────                           ││
       │  │ SELECT bookings                              ││
       │  │ WHERE status='Đang sử dụng'                  ││
       │  │ AND current_time >= (ngayChoi + gioKetThuc)──>││
       │  │<────matching rows───────────────────────────││
       │  │                                             ││
       │  │ FOR EACH booking:                           ││
       │  │   UPDATE status='Hoàn thành' ───────────────>││
       │  │   UPDATE payment status='Thành công' ────────>││
       │  │   checkAndRewardLoyalty(userId) ────────────>││
       │  │   INSERT notification (auto_checkout) ──────>││
       │  └─────────────────────────────────────────────┘│
       │                        │                        │
       │  ┌─────────────────────────────────────────────┐│
       │  │ 2. PAYMENT TIMEOUT                          ││
       │  │ ─────────────────                           ││
       │  │ SELECT bookings b                           ││
       │  │ JOIN payments p ON b.id=p.donDatId         ││
       │  │ WHERE b.status='Đã cọc'                     ││
       │  │ AND p.status='Chờ thanh toán'               ││
       │  │ AND p.ngayGiaoDich < NOW() - 15min ─────────>││
       │  │<────matching rows───────────────────────────││
       │  │                                             ││
       │  │ FOR EACH booking:                           ││
       │  │   cancelBookingWithReason(                  ││
       │  │     PAYMENT_TIMEOUT) ───────────────────────>││
       │  └─────────────────────────────────────────────┘│
       │                        │                        │
       │  ┌─────────────────────────────────────────────┐│
       │  │ 3. AUTO NO-SHOW                             ││
       │  │ ─────────────────                           ││
       │  │ SELECT bookings                             ││
       │  │ WHERE status IN ('Đã thanh toán',           ││
       │  │                  'Đã đặt','Đã cọc')         ││
       │  │ AND current_time >= (ngayChoi + gioBatDau)  ││
       │  │                    + 15 minutes ────────────>││
       │  │<────matching rows───────────────────────────││
       │  │                                             ││
       │  │ FOR EACH booking:                           ││
       │  │   cancelBookingWithReason(                  ││
       │  │     AUTO_NOSHOW) ───────────────────────────>││
       │  └─────────────────────────────────────────────┘│
       │                        │                        │
       │        COMPLETE        │                        │
       │<───────────────────────│                        │
```

### 3.8 Sequence: Đánh giá sân

```
User        Frontend     API Server         PostgreSQL
 │             │             │                    │
 │ Xem sân     │             │                    │
 │────────────>│             │                    │
 │             │             │                    │
 │ Chọn sao +  │             │                    │
 │ bình luận   │             │                    │
 │────────────>│             │                    │
 │             │             │                    │
 │             │ POST /api/reviews
 │             │─────────────────────────────>   │
 │             │             │                    │
 │             │             │ [IF có bookingId]  │
 │             │             │ ┌─────────────────┐│
 │             │             │ │Check: booking    ││
 │             │             │ │status='Hoàn      ││
 │             │             │ │thành'?           ││
 │             │             │ │Check: chưa có     ││
 │             │             │ │review trước đó?  ││
 │             │             │ └─────────────────┘│
 │             │             │                    │
 │             │             │ [IF có courtId]    │
 │             │             │ ┌─────────────────┐│
 │             │             │ │Check: 1 ngày/    ││
 │             │             │ │review?           ││
 │             │             │ │ (count reviews   ││
 │             │             │ │ in last 24h) ───>││
 │             │             │ │<──count──────────││
 │             │             │ └─────────────────┘│
 │             │             │                    │
 │             │             │ INSERT review ─────>│
 │             │             │                    │
 │             │ 201 Created │                    │
 │             │<─────────────────────────────    │
 │             │             │                    │
 │ Cập nhật UI │             │                    │
 │<────────────│             │                    │
```

---

## 4. TỔNG HỢP BUSINESS RULES

| # | Rule | Context |
|---|------|---------|
| 1 | OTP hết hạn sau 10 phút, 6 chữ số | Register, Forgot password |
| 2 | Rate limit login: 5 lần/phút/email | Login |
| 3 | JWT token hết hạn sau 7 ngày | Auth |
| 4 | Không hiển thị sân "Ẩn"/"Bảo trì" cho customer | Court listing |
| 5 | Khóa slot trước 15 phút giờ bắt đầu (`BOOKING_LOCK_THRESHOLD_MINS`) | Booking |
| 6 | Tất cả thao tác đặt sân trong TRANSACTION với SELECT FOR UPDATE | Booking |
| 7 | Phải hủy >= 3 tiếng trước giờ chơi | Cancel |
| 8 | Check-in trong 30 phút trước giờ bắt đầu, phải là hôm nay | Check-in |
| 9 | No-show: tự động hủy 15 phút sau giờ bắt đầu | Auto no-show |
| 10 | Payment timeout: hủy "Đã cọc" sau 15 phút chưa thanh toán | Payment timeout |
| 11 | Không hoàn tiền cho bất kỳ lý do hủy nào | Policy |
| 12 | VIP auto-booking tạo 4 bookings (4 tuần) ngay khi tạo series | VIP |
| 13 | Mỗi 3 booking hoàn thành → tặng mã LTY10 10% | Loyalty |
| 14 | User mới nhận WELCOME{id} giảm 20%, hạn 30 ngày | Welcome |
| 15 | VIP mới nhận VIP15 giảm 15% (max 200k), hạn 30 ngày | VIP |
| 16 | Xóa sân = soft delete ("Ẩn"), force=true mới hủy future bookings | Court management |
| 17 | Không xóa khung giờ nếu có future booking | Timeslot management |
| 18 | Không xóa dịch vụ nếu đã từng được dùng trong booking | Service management |
| 19 | Review: 1 lần/booking hoặc 1 lần/24h/sân | Review |
| 20 | Lock user → hủy future bookings + deactivate auto_booking_series | User management |
| 21 | Auto cancel past: chạy 00:05 hàng ngày, hủy auto-bookings quá ngày | Cron |
| 22 | VIP auto-booking: chạy 00:01 thứ 2, tạo booking tuần mới (legacy) | Cron |
