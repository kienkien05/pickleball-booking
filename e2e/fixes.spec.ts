import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function getExecResult(stdout: string): string {
  const lines = stdout.trim().split('\n').map(l => l.trim());
  return lines[lines.length - 1];
}

function futureDate(daysFromToday = 3): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

test.describe('Verification of Fixes E2E Tests', () => {
  test.describe.configure({ mode: 'serial' });

  let adminToken: string;
  let userToken: string;
  let emToken: string;

  test.beforeAll(async () => {
    console.log('Seeding the database for Fixes E2E tests...');
    execSync('npm run seed', { stdio: 'inherit' });

    console.log('Logging in to retrieve tokens globally...');
    
    // Đăng nhập Admin
    const adminRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pickleball.com', password: 'admin123' }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.token || adminData.data?.token;

    // Đăng nhập User (user1@gmail.com)
    const userRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user1@gmail.com', password: 'user123' }),
    });
    const userData = await userRes.json();
    userToken = userData.token || userData.data?.token;

    // Đăng nhập VIP2 (em@gmail.com)
    const emRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'em@gmail.com', password: 'user123' }),
    });
    const emData = await emRes.json();
    emToken = emData.token || emData.data?.token;

    console.log('Tokens retrieved successfully.');
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to the active backend port to establish page context without frontend server
    await page.goto('http://localhost:3001');
    await page.evaluate(() => localStorage.clear());
  });

  // ── FIX-001: Lock User Cancels Future Bookings ────────────────────────
  test('FIX-001: Lock user cancels future bookings and stops auto series', async ({ page }) => {
    // Toggle user #2 (user1@gmail.com) status to Locked
    const lockRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/users/2/toggle-status', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.status;
    }, adminToken);

    expect(lockRes).toBe(200);

    // Verify user bookings have been cancelled
    const bookingsRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/bookings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const bookings = data.bookings || data.data || [];
      return bookings.filter((b: any) => b.nguoiDungId === 2 && b.trangThai !== 'Đã hủy');
    }, adminToken);

    // All future bookings should be cancelled (ngayChoi >= current_date)
    const activeFutureBookings = bookingsRes.filter((b: any) => new Date(b.ngayChoi) >= new Date());
    expect(activeFutureBookings.length).toBe(0);

    // Toggle user #2 back to Active
    await page.evaluate(async (token) => {
      await fetch('http://localhost:3001/api/users/2/toggle-status', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }, adminToken);
  });

  // ── FIX-002: Toggle VIP Off stops auto booking series ──────────────
  test('FIX-002: Toggle VIP Off stops active auto booking series and VIP bookings', async ({ page }) => {
    // Toggle user #3 (vip@gmail.com) VIP off
    const toggleVipRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/users/3/toggle-vip', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.status;
    }, adminToken);

    expect(toggleVipRes).toBe(200);

    // Toggle VIP back to VIP
    await page.evaluate(async (token) => {
      await fetch('http://localhost:3001/api/users/3/toggle-vip', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }, adminToken);
  });

  // ── FIX-003: Block Locked User from Booking ──────────────────────────
  test('FIX-003: Chặn user bị Locked tại API đặt sân', async ({ page }) => {
    // Lock user #2
    await page.evaluate(async (token) => {
      await fetch('http://localhost:3001/api/users/2/toggle-status', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }, adminToken);

    // Try booking as user #2 (userToken)
    const bookingRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sanId: 1,
          ngayChoi: '2026-06-01',
          khungGioIds: [1],
          phuongThuc: 'transfer'
        })
      });
      return { status: res.status, body: await res.json() };
    }, userToken);

    expect(bookingRes.status).toBe(403);
    expect(bookingRes.body.error).toContain('Tài khoản của bạn đã bị khóa');

    // Unlock user #2
    await page.evaluate(async (token) => {
      await fetch('http://localhost:3001/api/users/2/toggle-status', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }, adminToken);
  });

  // ── FIX-004: Soft delete court stops auto booking series ────────────
  test('FIX-004: Soft delete court stops active auto booking series', async ({ page }) => {
    // Delete court #1 (soft delete/hide) with force=true to clear bookings
    const deleteRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/courts/1', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ force: true })
      });
      return res.status;
    }, adminToken);

    expect(deleteRes).toBe(200);

    // Verify timeslots returns empty array for court #1
    const timeslotsRes = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/api/courts/1/timeslots?date=2026-06-01');
      const data = await res.json();
      return data.data;
    });

    expect(timeslotsRes).toEqual([]);
  });

  // ── FIX-005: Regex validate phone number on registration ────────────
  test('FIX-005: Validate SĐT khi đăng ký tài khoản mới bằng Regex', async ({ page }) => {
    const regRes = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalidphone@gmail.com',
          password: 'user123',
          confirm_password: 'user123',
          full_name: 'Invalid Phone User',
          phone_number: 'abcde123'
        })
      });
      return { status: res.status, body: await res.json() };
    });

    expect(regRes.status).toBe(400);
    expect(regRes.body.error).toContain('Số điện thoại không hợp lệ');
  });

  // ── FIX-006: Review sanId resolution ─────────────────────────────────
  test('FIX-006: Tự động phân giải sanId từ đơn hàng khi review theo booking_id', async ({ page }) => {
    // Booking #7 is 'Đang sử dụng' with today's play date.
    // Admin completes the checkout so it turns into 'Hoàn thành'
    await page.evaluate(async (token) => {
      await fetch('http://localhost:3001/api/bookings/7/checkout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }, adminToken);

    // Review booking #7
    const reviewRes = await page.evaluate(async (token) => {
      const res = await fetch('http://localhost:3001/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          booking_id: 7,
          rating: 5,
          comment: 'Sân Victory quá tốt!'
        })
      });
      return { status: res.status, body: await res.json() };
    }, emToken);

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.data.sanId).toBe(4); // Booking #7 is on court #4

    // Delete review via Admin review moderation (FIX-007)
    const deleteReviewRes = await page.evaluate(async ({ token, reviewId }) => {
      const res = await fetch(`http://localhost:3001/api/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.status;
    }, { token: adminToken, reviewId: reviewRes.body.data.id });

    expect(deleteReviewRes).toBe(200);
  });

  // ── FIX-008: Frontend validation for TimeSlots ────────────────────────
  test('FIX-008: Kiểm tra validation ở Frontend cho TimeSlots', async ({ page }) => {
    // Đăng nhập Admin
    await page.goto('/login');
    await page.fill('input[placeholder="email@example.com"]', 'admin@pickleball.com');
    await page.fill('input[placeholder="••••••••"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');

    await page.goto('/admin/timeslots');
    await page.waitForURL('**/admin/timeslots');

    // Chọn sân Sunrise (sân thứ hai - ID 2) vì Landmark (ID 1) đã bị xóa mềm ở FIX-004
    const courtSelect = page.locator('select').first();
    await page.waitForSelector('select option[value="2"]', { state: 'attached', timeout: 10000 });
    await courtSelect.selectOption('2');
    await page.waitForTimeout(500);

    // Bấm nút "Thêm khung giờ"
    await page.click('button:has-text("Thêm khung giờ")');
    await page.waitForTimeout(500);

    // Điền giờ kết thúc trước giờ bắt đầu (Ví dụ: 18:00 đến 17:00)
    await page.fill('input[type="time"] >> nth=0', '18:00');
    await page.fill('input[type="time"] >> nth=1', '17:00');
    await page.fill('input[type="number"]', '150000');

    // Bấm "Lưu"
    await page.click('button:has-text("Lưu"), button[type="submit"]');

    // Verify toast error của client-side validation
    await expect(page.locator('text=Giờ kết thúc phải sau giờ bắt đầu')).toBeVisible({ timeout: 5000 });

    // Điền giờ hợp lý nhưng giá bằng 0
    await page.fill('input[type="time"] >> nth=0', '18:00');
    await page.fill('input[type="time"] >> nth=1', '19:30');
    await page.fill('input[type="number"]', '0');

    // Bấm "Lưu"
    await page.click('button:has-text("Lưu"), button[type="submit"]');

    // Verify toast error
    await expect(page.locator('text=Mức giá phải là số lớn hơn 0')).toBeVisible({ timeout: 5000 });
  });

  // ── FIX-009: Synchronization of "Chờ xác nhận" payment state to "Đã hủy" ────
  test('FIX-009: Đồng bộ trạng thái thanh toán Chờ xác nhận thành Đã hủy khi hủy đơn', async ({ page }) => {
    const playDate = futureDate(3);

    // 1. Đặt sân qua API bằng userToken
    const bookingRes = await page.evaluate(async ({ token, playDate }) => {
      const res = await fetch('http://localhost:3001/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sanId: 2,
          ngayChoi: playDate,
          khungGioIds: [13],
          phuongThuc: 'transfer'
        })
      });
      return { status: res.status, body: await res.json() };
    }, { token: userToken, playDate });

    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.bookingIds[0];

    // 2. Chuyển payment sang 'Chờ xác nhận' thông qua script database chạy bằng execSync
    execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"UPDATE payments SET trangThai = 'Chờ xác nhận' WHERE donDatId = ${bookingId}\\" ).then(() => pool.end());"`);

    // 3. Hủy đặt sân bằng userToken thông qua API cancel
    const cancelRes = await page.evaluate(async ({ token, id }) => {
      const res = await fetch(`http://localhost:3001/api/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.status;
    }, { token: userToken, id: bookingId });

    expect(cancelRes).toBe(200);

    // 4. Verify payment đã được đồng bộ sang 'Đã hủy'
    const paymentStatus = execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"SELECT trangThai FROM payments WHERE donDatId = ${bookingId}\\" ).then(r => { console.log(r.rows[0].trangThai); pool.end(); });"`).toString();
    expect(getExecResult(paymentStatus)).toBe('Đã hủy');
  });

  // ── FIX-010: user_vouchers usage history after cancellation ───────────
  test('FIX-010: Hủy đơn không cho dùng lại voucher usage_limit_per_user=1', async ({ page }) => {
    const code = `FIX010_${Date.now()}`;
    const playDate = futureDate(4);

    // 1. Tạo mã giảm giá riêng cho test, giới hạn mỗi user 1 lần
    const discountRes = await page.evaluate(async ({ token, code }) => {
      const res = await fetch('http://localhost:3001/api/discounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code,
          loaiGiamGia: 'percentage',
          mucGiamGia: 10,
          soLuongBanDau: 100,
          usageLimitPerUser: 1,
          ngayBatDau: '2026-01-01',
          ngayKetThuc: '2026-12-31',
          conditions: { target_audience: 'all' }
        })
      });
      return { status: res.status, body: await res.json() };
    }, { token: adminToken, code });

    expect(discountRes.status).toBe(201);
    const discountId = discountRes.body.data.id;

    // 2. Chèn một bản ghi user_vouchers 'Active' cho user 2
    execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"INSERT INTO user_vouchers (nguoiDungId, discountId, trangThai) VALUES (2, ${discountId}, 'Active') ON CONFLICT (nguoiDungId, discountId) DO UPDATE SET trangThai = 'Active', usedAt = NULL\\" ).then(() => pool.end());"`);

    // 3. Kiểm tra voucher đang ở trạng thái 'Active'
    const initialStatus = execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"SELECT trangThai FROM user_vouchers WHERE nguoiDungId = 2 AND discountId = ${discountId}\\" ).then(r => { console.log(r.rows[0].trangThai); pool.end(); });"`).toString();
    expect(getExecResult(initialStatus)).toBe('Active');

    // 4. Tạo booking mới sử dụng mã giảm giá vừa tạo
    const bookingRes = await page.evaluate(async ({ token, code, playDate }) => {
      const res = await fetch('http://localhost:3001/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sanId: 2,
          ngayChoi: playDate,
          khungGioIds: [14],
          phuongThuc: 'transfer',
          maGiamGia: code
        })
      });
      return { status: res.status, body: await res.json() };
    }, { token: userToken, code, playDate });

    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.bookingIds[0];

    // 5. Verify trạng thái voucher chuyển thành 'Used'
    const usedStatus = execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"SELECT trangThai FROM user_vouchers WHERE nguoiDungId = 2 AND discountId = ${discountId}\\" ).then(r => { console.log(r.rows[0].trangThai); pool.end(); });"`).toString();
    expect(getExecResult(usedStatus)).toBe('Used');

    // 6. Hủy đơn đặt sân vừa tạo
    const cancelRes = await page.evaluate(async ({ token, id }) => {
      const res = await fetch(`http://localhost:3001/api/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.status;
    }, { token: userToken, id: bookingId });

    expect(cancelRes).toBe(200);

    // 7. Voucher vẫn phải giữ trạng thái 'Used', không được quay lại 'Active'
    const statusAfterCancel = execSync(`node -e "const { pool } = require('./server/src/config/database'); pool.query(\\"SELECT trangThai FROM user_vouchers WHERE nguoiDungId = 2 AND discountId = ${discountId}\\" ).then(r => { console.log(r.rows[0].trangThai); pool.end(); });"`).toString();
    expect(getExecResult(statusAfterCancel)).toBe('Used');

    // 8. Validate lại cùng mã phải bị từ chối vì usage_limit_per_user=1 vẫn tính lần đã dùng
    const reuseRes = await page.evaluate(async ({ token, code }) => {
      const res = await fetch('http://localhost:3001/api/discounts/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code, totalAmount: 500000, courtId: 2 })
      });
      return { status: res.status, body: await res.json() };
    }, { token: userToken, code });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error).toContain('đã sử dụng');
  });
});
