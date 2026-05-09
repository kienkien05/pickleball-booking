let cancelBookingId = null;
let autoPayBookingId = null;
let bookingsCache = [];
let paymentMethods = [];
let activeFilter = 'all';

const SECTION_LABELS = {
    upcoming: '📌 Sắp tới',
    in_progress: '⚡ Đang chơi',
    completed: '✅ Đã hoàn thành',
    cancelled: '❌ Đã hủy'
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    await loadPaymentMethods();
    loadBookings();

    document.getElementById('confirm-cancel-btn').addEventListener('click', confirmCancel);
    document.getElementById('confirm-auto-pay-btn').addEventListener('click', confirmAutoPayment);

    // Filter tabs
    document.getElementById('filter-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-tab');
        if (!btn) return;

        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderBookings();
    });
});

async function loadPaymentMethods() {
    try {
        paymentMethods = await api.get('/bookings/payment-methods/list');
    } catch (error) {
        paymentMethods = [];
    }
}

async function loadBookings() {
    const container = document.getElementById('bookings-list');
    showLoading(container);

    try {
        bookingsCache = await api.get('/bookings');
        renderBookings();
    } catch (error) {
        container.innerHTML = '<p class="text-center text-danger">Có lỗi xảy ra khi tải lịch sử.</p>';
    }
}

function renderBookings() {
    const container = document.getElementById('bookings-list');
    let filtered = bookingsCache;

    if (activeFilter !== 'all') {
        filtered = bookingsCache.filter(b => b.sort_group === activeFilter);
    }

    if (filtered.length === 0) {
        const msg = activeFilter === 'all'
            ? 'Bạn chưa có đơn đặt sân nào.'
            : `Không có đơn nào trong mục "${SECTION_LABELS[activeFilter] || activeFilter}".`;
        container.innerHTML = `
            <div class="card text-center">
                <p class="text-muted">${msg}</p>
                ${activeFilter === 'all' ? '<a href="/user/search/search.html" class="btn btn-primary mt-2">Tìm sân ngay</a>' : ''}
            </div>`;
        return;
    }

    let html = '';
    let currentGroup = null;

    filtered.forEach(booking => {
        // Section header khi đổi nhóm (chỉ hiện khi filter = all)
        if (activeFilter === 'all' && booking.sort_group !== currentGroup) {
            currentGroup = booking.sort_group;
            html += `<div class="section-header">${SECTION_LABELS[currentGroup] || currentGroup}</div>`;
        }

        const payTypeLabel = getPaymentTypeLabel(booking);
        const paidInfo = getPaidInfo(booking);
        const autoBadge = booking.is_auto_booking
            ? `<span class="badge badge-info" style="font-size:0.75rem;margin-left:0.35rem;">Tự động VIP</span>`
            : '';

        const equipmentItems = Array.isArray(booking.equipment) ? booking.equipment : [];
        const equipmentSummary = equipmentItems.length > 0
            ? `<p class="mt-1 text-sm">
                   <span class="meta-label">Dịch vụ:</span>
                   ${equipmentItems.map(item => `${item.equipment_name} x${item.quantity}`).join(', ')}
                   <span class="text-muted">(${formatPrice(booking.equipment_total || 0)})</span>
               </p>`
            : '';

        // Doc Table 6 - Luồng phụ 1: Đơn thanh toán 100% không hỗ trợ hủy
        const canCancel = (booking.status === 'pending' || booking.status === 'confirmed')
            && booking.payment_type !== 'full';

        const isUpcoming = booking.sort_group === 'upcoming';

        html += `
        <div class="booking-card ${isUpcoming ? 'booking-upcoming' : ''}" data-sort-group="${booking.sort_group}">
            <img src="${booking.image_url || 'https://placehold.co/150x100?text=Court'}"
                 alt="${booking.court_name}"
                 class="booking-card-image"
                 onerror="this.src='https://placehold.co/150x100?text=Court'">

            <div class="booking-card-content">
                <h3>${booking.court_name} ${autoBadge}</h3>
                <p class="text-muted text-sm"><span class="meta-label">Địa chỉ:</span> ${booking.court_address}</p>
                <p class="mt-1">
                    <span class="meta-label">Ngày:</span> ${formatDate(booking.booking_date)} &nbsp;•&nbsp;
                    <span class="meta-label">Giờ:</span> ${booking.start_time} – ${booking.end_time}
                </p>
                <p class="mt-1">
                    <span class="meta-label">Thanh toán:</span> ${booking.payment_method || 'Chưa chọn'} &nbsp;
                    ${payTypeLabel}
                </p>
                ${equipmentSummary}
                <p class="mt-1">${paidInfo}</p>
            </div>

            <div class="booking-card-actions">
                ${getStatusBadge(booking.status)}

                ${canCancel
                    ? `<button class="btn btn-danger btn-sm mt-1"
                               onclick="openCancelModal(${booking.id})">Hủy đặt</button>`
                    : ''}

                ${booking.status === 'completed'
                    ? `<a href="/user/review/review.html?booking=${booking.id}"
                          class="btn btn-secondary btn-sm mt-1">Đánh giá</a>`
                    : ''}

                ${booking.can_pay_online
                    ? `<button class="btn btn-primary btn-sm mt-1"
                               onclick="openAutoPayModal(${booking.id})">Thanh toán online</button>`
                    : ''}
                ${booking.status === 'confirmed' || booking.status === 'in_progress'
                    ? `<button class="btn btn-info btn-sm mt-1"
                                onclick="openQrModal(${booking.id})">Mã QR Check-in</button>`
                    : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function getPaymentTypeLabel(booking) {
    if (booking.payment_type === 'deposit') {
        return `<span class="badge badge-warning" style="font-size:0.75rem;">Đặt cọc</span>`;
    }

    if (booking.payment_type === 'pay_later') {
        return `<span class="badge badge-secondary" style="font-size:0.75rem;">Thanh toán sau</span>`;
    }

    return `<span class="badge badge-primary" style="font-size:0.75rem;">Toàn phần</span>`;
}

function getPaidInfo(booking) {
    if (booking.payment_type === 'deposit') {
        return `Đã cọc: <strong class="text-primary">${formatPrice(booking.deposit_amount)}</strong>
                <small class="text-muted"> / ${formatPrice(booking.total_price)}</small>`;
    }

    if (booking.payment_type === 'pay_later') {
        return `Chưa thanh toán: <strong class="text-primary">${formatPrice(booking.total_price)}</strong>
                <small class="text-muted"> (trả tại sân hoặc online)</small>`;
    }

    return `Đã TT: <strong class="text-primary">${formatPrice(booking.amount_paid || booking.total_price)}</strong>`;
}

function openCancelModal(bookingId) {
    cancelBookingId = bookingId;
    document.getElementById('cancel-reason').value = '';
    showModal('cancel-modal');
}

async function confirmCancel() {
    if (!cancelBookingId) return;

    const btn    = document.getElementById('confirm-cancel-btn');
    const reason = document.getElementById('cancel-reason').value.trim();

    btn.disabled    = true;
    btn.textContent = 'Đang xử lý...';

    try {
        const result = await api.put(`/bookings/${cancelBookingId}/cancel`, { reason });

        hideModal('cancel-modal');
        showAlert(result.message || 'Hủy thành công!', 'success');
        loadBookings();
    } catch (error) {
        showAlert(error.message || 'Không thể hủy đặt sân', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Xác nhận hủy';
        cancelBookingId = null;
    }
}

function openAutoPayModal(bookingId) {
    const booking = bookingsCache.find(item => Number(item.id) === Number(bookingId));
    if (!booking) return;

    autoPayBookingId = bookingId;
    document.getElementById('auto-pay-court').textContent = booking.court_name;
    document.getElementById('auto-pay-date').textContent = formatDate(booking.booking_date);
    document.getElementById('auto-pay-slot').textContent = `${booking.start_time} – ${booking.end_time}`;
    document.getElementById('auto-pay-total').textContent = formatPrice(booking.total_price);

    document.getElementById('auto-pay-method').innerHTML = `
        <option value="">-- Chọn phương thức --</option>
        ${paymentMethods.map(method => `<option value="${method.id}">${method.display_name}</option>`).join('')}
    `;
    document.querySelector('input[name="auto-pay-type"][value="full"]').checked = true;

    showModal('auto-pay-modal');
}

async function confirmAutoPayment() {
    if (!autoPayBookingId) return;

    const btn = document.getElementById('confirm-auto-pay-btn');
    const methodId = document.getElementById('auto-pay-method').value;
    const payTypeRadio = document.querySelector('input[name="auto-pay-type"]:checked');
    const payType = payTypeRadio ? payTypeRadio.value : 'full';

    if (!methodId) {
        showAlert('Vui lòng chọn phương thức thanh toán', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
        const result = await api.put(`/bookings/${autoPayBookingId}/pay`, {
            payment_method_id: parseInt(methodId, 10),
            payment_type: payType
        });

        hideModal('auto-pay-modal');
        showAlert(result.message || 'Thanh toán thành công', 'success');
        loadBookings();
    } catch (error) {
        showAlert(error.message || 'Không thể thanh toán đơn tự động', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận thanh toán';
        autoPayBookingId = null;
    }
}

function openQrModal(bookingId) {
    const container = document.getElementById('qr-code-container');
    const label = document.getElementById('qr-booking-id');
    container.innerHTML = '';
    label.textContent = `Mã đơn: #${bookingId}`;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    // Sử dụng thư viện qrcode ở mức cơ bản nhất để máy quét dễ đọc nhất
    QRCode.toCanvas(canvas, String(bookingId), { 
        width: 280,
        margin: 1,
        scale: 10,
        errorCorrectionLevel: 'M'
    }, (error) => {
        if (error) {
            console.error(error);
            container.innerHTML = '<p class="text-danger">Không thể tạo mã QR</p>';
        }
    });

    showModal('qr-modal');
}
