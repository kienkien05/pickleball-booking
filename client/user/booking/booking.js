/**
 * Booking page — Chọn sân, khung giờ, hình thức thanh toán
 */

let courtData    = null;
let selectedSlot = null;
let selectedDate = null;
let paymentMethods = [];
let equipmentOptions = [];
let userProfile  = null;  // cache thông tin user (VIP, cancel_count)

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayInputValue() {
    return toDateInputValue(new Date());
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courtId = urlParams.get('id');

    if (!courtId) {
        window.location.href = '/user/search/search.html';
        return;
    }

    // Tải dữ liệu phụ trước để form render đúng payment/VIP/cancel policy.
    await Promise.all([
        loadPaymentMethods(),
        loadEquipmentOptions(courtId),
        loadUserProfile()
    ]);
    await loadCourtDetails(courtId);
});

async function loadUserProfile() {
    if (!isLoggedIn()) return;
    try {
        userProfile = await api.get('/users/profile');
    } catch (e) {
        console.warn('Không lấy được profile:', e.message);
    }
}

async function loadPaymentMethods() {
    try {
        const data = await api.get('/bookings/payment-methods/list');
        paymentMethods = data;
    } catch (error) {
        console.error('Load payment methods error:', error);
    }
}

async function loadEquipmentOptions(courtId) {
    try {
        // BẮT BUỘC: Truyền court_id để lấy đúng kho thiết bị của sân đó
        equipmentOptions = await api.get(`/bookings/equipment/list?court_id=${courtId}`);
    } catch (error) {
        equipmentOptions = [];
        console.error('Load equipment options error:', error);
    }
}

async function loadCourtDetails(courtId) {
    const container = document.getElementById('court-detail');

    try {
        [courtData] = await Promise.all([
            api.get(`/courts/${courtId}`)
        ]);
        const reviews = await api.get(`/courts/${courtId}/reviews`);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        selectedDate = toDateInputValue(tomorrow);

        // Xây dựng giao diện
        container.innerHTML = buildCourtDetailHTML(courtData, reviews);

        // Load slots
        loadSlots();

        // Sự kiện đổi ngày
        document.getElementById('booking-date').addEventListener('change', (e) => {
            selectedDate = e.target.value;
            selectedSlot = null;
            updatePriceSummary(null);
            loadSlots();
        });

        // Sự kiện chọn hình thức TT
        document.querySelectorAll('input[name="payment-type"]').forEach(radio => {
            radio.addEventListener('change', updatePriceSummary);
        });

        document.querySelectorAll('.equipment-qty').forEach(input => {
            input.addEventListener('input', () => {
                const max = parseInt(input.max, 10) || 0;
                let value = parseInt(input.value, 10) || 0;
                if (value < 0) value = 0;
                if (value > max) value = max;
                input.value = value;
                updatePriceSummary();
            });
        });

        // Nút đặt sân
        document.getElementById('book-btn').addEventListener('click', () => {
            if (!isLoggedIn()) {
                window.location.href = '/auth/login/login.html';
                return;
            }
            openConfirmModal();
        });

        // Sự kiện chọn PTTT
        document.getElementById('payment-method').addEventListener('change', updateBookButton);

        // Nút xác nhận trong modal
        document.getElementById('confirm-booking-btn').addEventListener('click', submitBooking);

    } catch (error) {
        container.innerHTML = '<p class="text-center text-danger">Không thể tải thông tin sân.</p>';
    }
}

function buildCourtDetailHTML(court, reviews) {
    const cancelCount = userProfile ? (userProfile.cancel_count || 0) : 0;
    const canDeposit  = cancelCount < 3;
    const isVip       = userProfile ? userProfile.is_vip : false;

    const paymentMethodOptions = paymentMethods.map(
        p => `<option value="${p.id}">${p.display_name}</option>`
    ).join('');

    const equipmentHTML = equipmentOptions.length > 0
        ? equipmentOptions.map(item => `
            <div class="equipment-item">
                <div class="equipment-info">
                    <strong>${item.name}</strong>
                    <div class="text-sm text-muted">${item.description || 'Dịch vụ đi kèm khi đặt sân'}</div>
                    <div class="text-sm text-primary">${formatPrice(item.price_per_booking)} / lượt</div>
                </div>
                <div class="equipment-control">
                    <label class="sr-only" for="equipment-${item.id}">Số lượng ${item.name}</label>
                    <input type="number"
                           id="equipment-${item.id}"
                           class="form-control equipment-qty"
                           min="0"
                           max="${item.available_quantity}"
                           value="0"
                           inputmode="numeric"
                           data-equipment-id="${item.id}"
                           data-name="${item.name}"
                           data-price="${item.price_per_booking}">
                    <span class="text-sm text-muted">Còn ${item.available_quantity}</span>
                </div>
            </div>
        `).join('')
        : '<p class="text-muted text-sm">Hiện chưa có dịch vụ đi kèm.</p>';

    const depositWarning = !canDeposit
        ? `<div class="alert alert-warning mt-1" style="font-size:0.85rem;">
             Bạn đã hủy ${cancelCount} lần. Bắt buộc <strong>thanh toán toàn phần</strong>.
           </div>`
        : '';

    const vipBadge = isVip ? `<span class="badge badge-primary" style="font-size:0.75rem;">VIP</span>` : '';

    const reviewsHTML = reviews.length > 0
        ? reviews.slice(0, 3).map(r => `
            <div class="card" style="padding: 1rem; margin-bottom: 0.75rem;">
                <div class="flex-between">
                    <strong>${r.user_name} ${r.is_vip ? '<span class="badge badge-primary" style="font-size:0.7rem;margin-left:0.35rem;">VIP</span>' : ''}</strong>
                    ${getStarsHTML(r.rating)}
                </div>
                <p class="text-muted text-sm mt-1">${r.comment || 'Không có nhận xét'}</p>
            </div>`).join('')
        : '<p class="text-muted">Chưa có đánh giá nào.</p>';

    return `
    <!-- Left: Court Info -->
    <div>
        <img src="${court.image_url || 'https://placehold.co/600x400?text=Pickleball'}"
             alt="${court.name}"
             style="width:100%;height:280px;object-fit:cover;border-radius:var(--radius-lg);"
             onerror="this.src='https://placehold.co/600x400?text=Pickleball'">

        <h1 class="mt-2">${court.name}</h1>
        <p class="text-muted"><span class="meta-label">Địa chỉ:</span> ${court.address}${court.district_name ? ', ' + court.district_name : ''}</p>

        <div class="flex-between mt-1">
            <div>${court.avg_rating
                ? getStarsHTML(Math.round(court.avg_rating)) + ` (${court.review_count} đánh giá)`
                : 'Chưa có đánh giá'}</div>
            <div class="text-lg font-bold text-primary">${formatPrice(court.price_per_hour)}/giờ</div>
        </div>

        ${court.description ? `<p class="mt-2">${court.description}</p>` : ''}

        <div class="mt-3">
            <h3>Đánh giá từ khách hàng</h3>
            ${reviewsHTML}
        </div>
    </div>

    <!-- Right: Booking Form -->
    <div class="card">
        <h2 class="mb-2">Đặt sân ${vipBadge}</h2>

        <div class="form-group">
            <label class="form-label">Chọn ngày</label>
            <input type="date" id="booking-date" class="form-control"
                   value="${selectedDate}"
                   min="${getTodayInputValue()}">
        </div>

        <div class="form-group">
            <label class="form-label">Chọn khung giờ</label>
            <div id="slots-container" class="slot-grid">
                <div class="loading"><div class="spinner"></div></div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Hình thức thanh toán</label>
            <div style="display:flex;gap:1rem;margin-top:0.5rem;">
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
                    <input type="radio" name="payment-type" value="deposit"
                           ${!canDeposit ? 'disabled' : 'checked'}>
                    <span>Đặt cọc 10% <small class="text-muted">(trả còn lại tại sân)</small></span>
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
                    <input type="radio" name="payment-type" value="full"
                           ${!canDeposit ? 'checked' : ''}>
                    <span>Thanh toán toàn phần</span>
                </label>
            </div>
            ${depositWarning}
        </div>

        <div class="form-group">
            <label class="form-label">Phương thức thanh toán</label>
            <select id="payment-method" class="form-control">
                <option value="">-- Chọn phương thức --</option>
                ${paymentMethodOptions}
            </select>
        </div>

        <div class="form-group">
            <label class="form-label">Dịch vụ đi kèm / thuê thiết bị</label>
            <div class="equipment-list">
                ${equipmentHTML}
            </div>
        </div>

        <!-- Bảng tổng tiền -->
        <div class="card" id="price-summary" style="background:var(--background-alt);">
            <div class="flex-between">
                <span>Giá/giờ:</span>
                <span>${formatPrice(court.price_per_hour)}</span>
            </div>
            <div class="flex-between">
                <span>Thời lượng:</span>
                <span id="duration-display">-- chọn khung giờ --</span>
            </div>
            <div class="flex-between">
                <span>Hệ số giờ:</span>
                <span id="modifier-display">x 1.0</span>
            </div>
            <div class="flex-between">
                <span>Tiền sân:</span>
                <span id="court-price-display">--</span>
            </div>
            <div class="flex-between">
                <span>Dịch vụ đi kèm:</span>
                <span id="equipment-total-display">${formatPrice(0)}</span>
            </div>
            <hr style="margin:0.5rem 0;border:none;border-top:1px solid var(--border-color);">
            <div class="flex-between">
                <span>Tổng tiền:</span>
                <span class="font-bold" id="total-price-display">--</span>
            </div>
            <div class="flex-between" id="deposit-row" style="color:var(--primary-color);">
                <span>Cần thanh toán ngay (đặt cọc 10%):</span>
                <span class="font-bold" id="deposit-amount-display">--</span>
            </div>
        </div>

        <button class="btn btn-primary btn-block mt-2" id="book-btn" disabled>
            Đặt sân ngay
        </button>
        ${!isLoggedIn() ? `<p class="text-center text-muted text-sm mt-1">
            <a href="/auth/login/login.html">Đăng nhập</a> để đặt sân</p>` : ''}
    </div>
    `;
}

async function loadSlots() {
    const container = document.getElementById('slots-container');
    if (!container) return;
    showLoading(container);

    try {
        const slots = await api.get(`/courts/${courtData.id}/slots?date=${selectedDate}`);

        container.innerHTML = slots.map(slot => `
            <button class="slot-btn ${slot.available ? '' : 'unavailable'}"
                    data-slot-id="${slot.id}"
                    data-name="${slot.name}"
                    data-start="${slot.start_time}"
                    data-end="${slot.end_time}"
                    data-duration="${slot.duration_hours}"
                    data-modifier="${slot.price_modifier}"
                    data-price="${slot.estimated_price}"
                    ${slot.available ? '' : 'disabled'}
                    title="${slot.name} | ${formatPrice(slot.estimated_price)}">
                <div class="font-bold">${slot.start_time}–${slot.end_time}</div>
                <div class="text-sm" style="font-size:0.75rem;">${slot.name}</div>
                <div class="text-sm text-primary" style="font-size:0.8rem;">${formatPrice(slot.estimated_price)}</div>
            </button>
        `).join('');

        // Chọn slot
        container.querySelectorAll('.slot-btn:not(.unavailable)').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSlot = {
                    id:        btn.dataset.slotId,
                    name:      btn.dataset.name,
                    start:     btn.dataset.start,
                    end:       btn.dataset.end,
                    duration:  parseFloat(btn.dataset.duration),
                    modifier:  parseFloat(btn.dataset.modifier),
                    price:     parseFloat(btn.dataset.price)
                };
                updatePriceSummary();
                updateBookButton();
            });
        });

        updateBookButton();
    } catch (error) {
        container.innerHTML = '<p class="text-danger">Không thể tải khung giờ.</p>';
    }
}

function getSelectedPaymentType() {
    const radio = document.querySelector('input[name="payment-type"]:checked');
    return radio ? radio.value : 'full';
}

function isAutoWeeklyEnabled() {
    const checkbox = document.getElementById('vip-auto-weekly');
    return Boolean(checkbox && checkbox.checked && userProfile && userProfile.is_vip);
}

function getSelectedEquipment() {
    return Array.from(document.querySelectorAll('.equipment-qty')).map(input => {
        const quantity = parseInt(input.value, 10) || 0;
        const price = parseFloat(input.dataset.price) || 0;
        return {
            equipment_id: parseInt(input.dataset.equipmentId, 10),
            name: input.dataset.name,
            quantity,
            price,
            subtotal: price * quantity
        };
    }).filter(item => item.quantity > 0);
}

function getEquipmentTotal() {
    return getSelectedEquipment().reduce((sum, item) => sum + item.subtotal, 0);
}

function updatePriceSummary() {
    const equipmentTotal = getEquipmentTotal();
    const equipmentTotalDisplay = document.getElementById('equipment-total-display');
    if (equipmentTotalDisplay) {
        equipmentTotalDisplay.textContent = formatPrice(equipmentTotal);
    }

    if (!selectedSlot) {
        document.getElementById('duration-display').textContent  = '-- chọn khung giờ --';
        document.getElementById('modifier-display').textContent  = 'x 1.0';
        document.getElementById('court-price-display').textContent = '--';
        document.getElementById('total-price-display').textContent = '--';
        document.getElementById('deposit-amount-display').textContent = '--';
        document.getElementById('deposit-row').style.display = 'flex';
        return;
    }

    const payType    = getSelectedPaymentType();
    const courtPrice = selectedSlot.price;
    const total      = courtPrice + equipmentTotal;
    const deposit    = Math.round(total * 0.1);

    document.getElementById('duration-display').textContent  = `${selectedSlot.duration}h (${selectedSlot.name})`;
    document.getElementById('modifier-display').textContent  = `x ${selectedSlot.modifier.toFixed(1)}`;
    document.getElementById('court-price-display').textContent = formatPrice(courtPrice);
    document.getElementById('total-price-display').textContent = formatPrice(total);

    const depositRow = document.getElementById('deposit-row');
    if (payType === 'deposit') {
        depositRow.style.display = 'flex';
        document.getElementById('deposit-amount-display').textContent = formatPrice(deposit);
    } else {
        depositRow.style.display = 'none';
    }
}

function updateBookButton() {
    const btn           = document.getElementById('book-btn');
    const paymentSelect = document.getElementById('payment-method');
    if (!btn || !paymentSelect) return;
    btn.disabled = !selectedSlot || !paymentSelect.value || !isLoggedIn();
}

function openConfirmModal() {
    const paymentSelect  = document.getElementById('payment-method');
    const paymentMethod  = paymentMethods.find(p => p.id == paymentSelect.value);
    const payType        = getSelectedPaymentType();
    const equipmentItems = getSelectedEquipment();
    const equipmentTotal = equipmentItems.reduce((sum, item) => sum + item.subtotal, 0);
    const total          = selectedSlot.price + equipmentTotal;
    const deposit        = Math.round(total * 0.1);
    const amountNow      = payType === 'deposit' ? deposit : total;

    document.getElementById('confirm-court').textContent       = courtData.name;
    document.getElementById('confirm-date').textContent        = formatDate(selectedDate);
    document.getElementById('confirm-slot').textContent        = `${selectedSlot.start}–${selectedSlot.end} (${selectedSlot.name})`;
    document.getElementById('confirm-payment-method').textContent = paymentMethod ? paymentMethod.display_name : '-';
    document.getElementById('confirm-equipment').textContent  = equipmentItems.length > 0
        ? equipmentItems.map(item => `${item.name} x${item.quantity}`).join(', ')
        : 'Không chọn';
    document.getElementById('confirm-total').textContent       = formatPrice(total);
    document.getElementById('confirm-pay-now').textContent     = formatPrice(amountNow);

    const payTypeRow = document.getElementById('confirm-pay-type-row');
    if (payType === 'deposit') {
        payTypeRow.innerHTML = `<td>Hình thức:</td><td><span class="badge badge-warning">Đặt cọc 10%</span></td>`;
    } else {
        payTypeRow.innerHTML = `<td>Hình thức:</td><td><span class="badge badge-primary">Toàn phần</span></td>`;
    }

    const autoRow = document.getElementById('vip-auto-weekly-row');
    const autoCheckbox = document.getElementById('vip-auto-weekly');
    if (autoRow && autoCheckbox) {
        const canUseAutoBooking = Boolean(userProfile && userProfile.is_vip);
        autoRow.classList.toggle('hidden', !canUseAutoBooking);
        autoCheckbox.checked = false;
        autoCheckbox.disabled = !canUseAutoBooking;
    }

    showModal('confirm-modal');
}

async function submitBooking() {
    const btn            = document.getElementById('confirm-booking-btn');
    const paymentMethodId = document.getElementById('payment-method').value;
    const payType        = getSelectedPaymentType();
    const equipmentItems = getSelectedEquipment().map(item => ({
        equipment_id: item.equipment_id,
        quantity: item.quantity
    }));

    btn.disabled    = true;
    btn.textContent = 'Đang xử lý...';

    try {
        const result = await api.post('/bookings', {
            court_id:          courtData.id,
            slot_id:           parseInt(selectedSlot.id),
            booking_date:      selectedDate,
            payment_method_id: parseInt(paymentMethodId),
            payment_type:      payType,
            auto_weekly:       isAutoWeeklyEnabled(),
            equipment_items:   equipmentItems
        });

        hideModal('confirm-modal');
        showAlert(result.message || 'Đặt sân thành công!', 'success');

        setTimeout(() => {
            window.location.href = '/user/history/history.html';
        }, 1800);
    } catch (error) {
        showAlert(error.message || 'Có lỗi xảy ra', 'error');
        btn.disabled    = false;
        btn.textContent = 'Xác nhận đặt sân';
    }
}
