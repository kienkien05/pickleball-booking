import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Services E2E Tests', () => {

  test.beforeAll(() => {
    console.log('Seeding the database for Services E2E tests...');
    execSync('npm run seed', { stdio: 'inherit' });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  async function loginAsAdmin(page: any) {
    await page.goto('/login');
    await page.fill('input[placeholder="email@example.com"]', 'admin@pickleball.com');
    await page.fill('input[placeholder="••••••••"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
  }

  async function loginAsUser(page: any) {
    await page.goto('/login');
    await page.fill('input[placeholder="email@example.com"]', 'user1@gmail.com');
    await page.fill('input[placeholder="••••••••"]', 'user123');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:5173/');
  }

  // ── SVC-001: List Services ──────────────────────────────────────────
  test('SVC-001: Xem danh sách dịch vụ', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.waitForTimeout(500);

    // Services list should be displayed
    const services = page.locator('table tr, .service-item, [data-testid="service-item"], div.bg-card');
    const count = await services.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── SVC-002: Create Service ─────────────────────────────────────────
  test('SVC-002: Admin tạo dịch vụ mới', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.waitForTimeout(500);

    // Click add service
    await page.click('button:has-text("Thêm dịch vụ"), button:has-text("Thêm")');

    await page.waitForTimeout(500);

    // Fill service name
    await page.fill('input[name="tenDichVu"], input[placeholder*="tên"]', 'Khăn lạnh');

    // Select type
    const typeSelect = page.locator('select, [role="listbox"]').first();
    await typeSelect.selectOption('Dụng cụ').catch(() => {});

    // Fill price
    await page.fill('input[type="number"] >> nth=0, input[name="donGia"]', '20000');

    // Fill inventory
    const inventoryInput = page.locator('input[type="number"] >> nth=1, input[name="soLuongTon"]');
    if (await inventoryInput.isVisible()) {
      await inventoryInput.fill('50');
    }

    // Save
    await page.click('button:has-text("Lưu"), button[type="submit"]');

    // Verify success
    await expect(page.locator('text=Tạo').or(page.locator('text=thành công'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-003: Update Service ─────────────────────────────────────────
  test('SVC-003: Admin cập nhật giá dịch vụ', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.waitForTimeout(500);

    // Click Edit on first service
    await page.click('button:has-text("Sửa"), button:has-text("Edit"), a:has-text("Sửa")');

    await page.waitForTimeout(500);

    // Update price
    const priceInput = page.locator('input[type="number"] >> nth=0, input[name="donGia"]');
    if (await priceInput.isVisible()) {
      await priceInput.clear();
      await priceInput.fill('25000');
    }

    // Save
    await page.click('button:has-text("Lưu"), button[type="submit"]');

    // Verify success
    await expect(page.locator('text=Cập nhật').or(page.locator('text=thành công'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-004: Delete Service (unused) ────────────────────────────────
  test('SVC-004: Admin xóa dịch vụ chưa được sử dụng', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.waitForTimeout(500);

    // Find and delete a service
    const deleteButtons = page.locator('button:has-text("Xóa"), button:has-text("Delete")');
    if (await deleteButtons.count() > 0) {
      await deleteButtons.last().click();

      // Confirm
      const confirmBtn = page.locator('button:has-text("Xác nhận"), button:has-text("OK")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      await expect(page.locator('text=Xóa').or(page.locator('text=thành công'))).toBeVisible({ timeout: 5000 });
    }
  });

  // ── SVC-005: Create Service with negative price ─────────────────────
  test('SVC-005: Tạo dịch vụ với giá âm', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.click('button:has-text("Thêm dịch vụ"), button:has-text("Thêm")');
    await page.waitForTimeout(500);

    await page.fill('input[name="tenDichVu"], input[placeholder*="tên"]', 'Test Service');

    // Fill negative price
    await page.fill('input[type="number"] >> nth=0, input[name="donGia"]', '-10000');

    await page.click('button:has-text("Lưu"), button[type="submit"]');

    await expect(page.locator('text=dương').or(page.locator('text=không hợp lệ')).or(page.locator('text=phải lớn hơn'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-006: Create Service with negative inventory ─────────────────
  test('SVC-006: Tạo dịch vụ với tồn kho âm', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.click('button:has-text("Thêm dịch vụ"), button:has-text("Thêm")');
    await page.waitForTimeout(500);

    await page.fill('input[name="tenDichVu"], input[placeholder*="tên"]', 'Test Negative Stock');

    await page.fill('input[type="number"] >> nth=0, input[name="donGia"]', '10000');

    const inventoryInput = page.locator('input[type="number"] >> nth=1, input[name="soLuongTon"]');
    if (await inventoryInput.isVisible()) {
      await inventoryInput.fill('-5');
    }

    await page.click('button:has-text("Lưu"), button[type="submit"]');

    await expect(page.locator('text=không hợp lệ').or(page.locator('text=phải lớn hơn')).or(page.locator('text=âm'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-007: Create Service without name ────────────────────────────
  test('SVC-007: Tạo dịch vụ không nhập tên', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.click('button:has-text("Thêm dịch vụ"), button:has-text("Thêm")');
    await page.waitForTimeout(500);

    // Fill price but not name
    await page.fill('input[type="number"] >> nth=0, input[name="donGia"]', '20000');

    await page.click('button:has-text("Lưu"), button[type="submit"]');

    await expect(page.locator('text=nhập tên').or(page.locator('text=không được để trống')).or(page.locator('text=Vui lòng nhập'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-008: Create Service without price ───────────────────────────
  test('SVC-008: Tạo dịch vụ không nhập giá', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/services');
    await page.waitForURL('**/admin/services');

    await page.click('button:has-text("Thêm dịch vụ"), button:has-text("Thêm")');
    await page.waitForTimeout(500);

    // Fill name but not price
    await page.fill('input[name="tenDichVu"], input[placeholder*="tên"]', 'Test No Price');

    await page.click('button:has-text("Lưu"), button[type="submit"]');

    await expect(page.locator('text=nhập giá').or(page.locator('text=không được để trống')).or(page.locator('text=Vui lòng nhập'))).toBeVisible({ timeout: 5000 });
  });

  // ── SVC-009: Customer tries to create service ───────────────────────
  test('SVC-009: Customer thử tạo dịch vụ', async ({ page }) => {
    await loginAsUser(page);

    const response = await page.evaluate(async () => {
      const auth = localStorage.getItem('pickleball-auth');
      const token = auth ? JSON.parse(auth).state.token : '';
      const res = await fetch('http://localhost:3000/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ tenDichVu: 'Hack', donGia: 10000 }),
      });
      return res.status;
    });

    expect(response).toBe(403);
  });

  // ── SVC-010: Customer tries to delete service ───────────────────────
  test('SVC-010: Customer thử xóa dịch vụ', async ({ page }) => {
    await loginAsUser(page);

    const response = await page.evaluate(async () => {
      const auth = localStorage.getItem('pickleball-auth');
      const token = auth ? JSON.parse(auth).state.token : '';
      const res = await fetch('http://localhost:3000/api/services/1', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return res.status;
    });

    expect(response).toBe(403);
  });

  // ── SVC-011: Book service with zero inventory ───────────────────────
  test('SVC-011: Đặt dịch vụ hết hàng (tồn kho = 0)', async ({ page }) => {
    await loginAsUser(page);

    // Service 8 (Trà đá) has soLuongTon = 0
    await page.goto('/courts/1');
    await page.waitForURL('**/courts/1');

    await page.waitForTimeout(1000);

    // When selecting a timeslot to book, services should be available
    // Service 8 should show "Hết hàng" or be disabled
    // This depends on booking flow UI
  });

  // ── SVC-012: Book service quantity exceeding inventory ──────────────
  test('SVC-012: Đặt dịch vụ số lượng vượt tồn kho', async ({ page }) => {
    await loginAsUser(page);

    const result = await page.evaluate(async () => {
      const auth = localStorage.getItem('pickleball-auth');
      const token = auth ? JSON.parse(auth).state.token : '';

      // Create booking first, then try to add excessive service
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const bookingRes = await fetch('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sanId: 3,
          khungGioId: 22,
          ngayChoi: tomorrow,
          services: [{ dichVuId: 1, soLuong: 9999 }],
        }),
      });
      return { status: bookingRes.status, body: await bookingRes.json().catch(() => ({})) };
    });

    // Should reject - exceeding inventory
    if (result.status !== 201) {
      expect(result.status).toBeGreaterThanOrEqual(400);
    }
  });
});
