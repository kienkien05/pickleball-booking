/**
 * Admin Orders Page — Quản lý đơn đặt sân
 * Hỗ trợ: Xác nhận → Check-in → Hoàn thành | Hủy
 */

let currentAction    = null;
let currentBookingId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    loadBookings();
    document.getElementById('status-filter').addEventListener('change', loadBookings);
    document.getElementById('confirm-action-btn').addEventListener('click', executeAction);
});

async function loadBookings() {
    const tbody  = document.getElementById('bookings-list');
    const status = document.getElementById('status-filter').value;

    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Đang tải...</td></tr>';

    try {
        let url = '/admin/bookings';
        if (status) url += `?status=${status}`;

        const response = await api.get(url);
        const bookings = response.data || response; // hỗ trợ cả 2 format

        if (!bookings || bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Không có đơn nào</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.map(b => {
            let payTypeBadge = `<span class="badge badge-primary" style="font-size:0.7rem;">Toàn phần</span>`;
            let paidInfo = `<div class="text-sm">Đã TT: ${formatPrice(b.amount_paid || b.total_price)}</div>`;
            if (b.payment_type === 'deposit') {
                payTypeBadge = `<span class="badge badge-warning" style="font-size:0.7rem;">Đặt cọc</span>`;
                paidInfo = `<div class="text-sm">Đã cọc: ${formatPrice(b.deposit_amount)}</div>`;
            } else if (b.payment_type === 'pay_later') {
                payTypeBadge = `<span class="badge badge-secondary" style="font-size:0.7rem;">Thanh toán sau</span>`;
                paidInfo = `<div class="text-sm">Chưa TT: ${formatPrice(b.total_price)}</div>`;
            }

            const equipmentInfo = b.equipment_summary
                ? `<div class="text-sm text-muted">DV: ${b.equipment_summary}</div>`
                : '';

            const vipBadge  = b.is_vip ? '<span class="badge badge-primary" style="font-size:0.7rem;margin-left:0.35rem;">VIP</span>' : '';
            const autoBadge = b.is_auto_booking ? '<span class="badge badge-info" style="font-size:0.7rem;margin-left:0.35rem;">Tự động</span>' : '';
            const cancelWarn = b.cancel_count >= 3 ? `<span class="badge badge-danger" style="font-size:0.7rem;">Hủy ${b.cancel_count}x</span>` : '';

            // Nút hành động theo trạng thái
            let actions = '';
            if (b.status === 'pending') {
                actions = `
                    <button class="btn btn-success btn-sm" onclick="openActionModal(${b.id}, 'confirm')"><i class="bi bi-check-lg"></i> Xác nhận</button>
                    <button class="btn btn-danger btn-sm"  onclick="openActionModal(${b.id}, 'cancel')"><i class="bi bi-x-lg"></i> Hủy</button>`;
            } else if (b.status === 'confirmed') {
                actions = `
                    <button class="btn btn-primary btn-sm" onclick="openActionModal(${b.id}, 'checkin')"><i class="bi bi-box-arrow-in-right"></i> Check-in</button>
                    <button class="btn btn-warning btn-sm" onclick="openActionModal(${b.id}, 'no_show')"><i class="bi bi-person-x"></i> Vắng mặt</button>
                    <button class="btn btn-danger btn-sm"  onclick="openActionModal(${b.id}, 'cancel')"><i class="bi bi-x-lg"></i> Hủy</button>`;
            } else if (b.status === 'in_progress') {
                actions = `
                    <button class="btn btn-success btn-sm" onclick="openActionModal(${b.id}, 'complete')"><i class="bi bi-check2-circle"></i> Hoàn thành</button>`;
            }

            return `
            <tr>
                <td>#${b.id}</td>
                <td>
                    ${b.user_name || '--'}${vipBadge}${autoBadge}<br>
                    <span class="text-sm text-muted">${b.user_email || ''}</span><br>
                    ${cancelWarn}
                </td>
                <td>${b.court_name || '--'}</td>
                <td>${formatDate(b.booking_date)}</td>
                <td>${b.start_time} – ${b.end_time}</td>
                <td>${getStatusBadge(b.status)}</td>
                <td>
                    ${formatPrice(b.total_price)}<br>
                    ${payTypeBadge}<br>
                    ${paidInfo}
                    ${equipmentInfo}
                </td>
                <td>${b.payment_method || '--'}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
    }
}

function openActionModal(bookingId, action) {
    currentBookingId = bookingId;
    currentAction    = action;

    const config = {
        confirm:  { title: 'Xác nhận đơn',         msg: 'Xác nhận đơn đặt sân này?',                                  btnClass: 'btn btn-success' },
        checkin:  { title: 'Check-in khách',        msg: 'Khách đã đến? Chuyển sang đang chơi?',                       btnClass: 'btn btn-primary' },
        complete: { title: 'Hoàn thành đơn',        msg: 'Đánh dấu đơn này là đã hoàn thành?',                         btnClass: 'btn btn-success' },
        cancel:   { title: 'Hủy đơn',               msg: 'Xác nhận hủy đơn đặt sân này?',                              btnClass: 'btn btn-danger'  },
        no_show:  { title: 'Vắng mặt (No-show)',    msg: 'Khách không đến? Hủy đơn và tịch thu tiền cọc?',             btnClass: 'btn btn-warning' }
    };

    const c = config[action] || config.confirm;
    document.getElementById('modal-title').textContent   = c.title;
    document.getElementById('modal-message').textContent = c.msg;
    document.getElementById('confirm-action-btn').className = c.btnClass;
    document.getElementById('reason-group').classList.toggle('hidden', action !== 'cancel' && action !== 'no_show');
    document.getElementById('reason-label').textContent = action === 'no_show' ? 'Ghi chú (không bắt buộc)' : 'Lý do hủy';
    document.getElementById('cancel-reason').value = '';

    showModal('action-modal');
}

async function executeAction() {
    const btn    = document.getElementById('confirm-action-btn');
    const reason = document.getElementById('cancel-reason').value.trim();

    btn.disabled    = true;
    btn.textContent = 'Đang xử lý...';

    try {
        const result = await api.put(`/admin/bookings/${currentBookingId}`, {
            action: currentAction,
            reason: currentAction === 'cancel' ? reason : undefined
        });

        hideModal('action-modal');
        showAlert(result.message || 'Thao tác thành công!', 'success');
        loadBookings();
    } catch (error) {
        showAlert(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Xác nhận';
        currentBookingId = null;
        currentAction    = null;
    }
}
