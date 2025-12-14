// Admin Orders Page

let currentAction = null;
let currentBookingId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    loadBookings();
    document.getElementById('status-filter').addEventListener('change', loadBookings);
    document.getElementById('confirm-action-btn').addEventListener('click', executeAction);
});

async function loadBookings() {
    const tbody = document.getElementById('bookings-list');
    const status = document.getElementById('status-filter').value;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Đang tải...</td></tr>';

    try {
        let url = '/admin/bookings';
        if (status) url += `?status=${status}`;

        const bookings = await api.get(url);

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Không có đơn nào</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.map(b => `
      <tr>
        <td>#${b.id}</td>
        <td>
          ${b.user_name}<br>
          <span class="text-sm text-muted">${b.user_email}</span>
        </td>
        <td>${b.court_name}</td>
        <td>${formatDate(b.booking_date)}</td>
        <td>${b.start_time} - ${b.end_time}</td>
        <td>${getStatusBadge(b.status)}</td>
        <td>${formatPrice(b.total_price)}</td>
        <td>
          ${b.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="openActionModal(${b.id}, 'confirm')">Xác nhận</button>
            <button class="btn btn-danger btn-sm" onclick="openActionModal(${b.id}, 'cancel')">Hủy</button>
          ` : ''}
          ${b.status === 'confirmed' ? `
            <button class="btn btn-primary btn-sm" onclick="openActionModal(${b.id}, 'complete')">Hoàn thành</button>
            <button class="btn btn-danger btn-sm" onclick="openActionModal(${b.id}, 'cancel')">Hủy</button>
          ` : ''}
        </td>
      </tr>
    `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
    }
}

function openActionModal(bookingId, action) {
    currentBookingId = bookingId;
    currentAction = action;

    const messages = {
        confirm: 'Bạn có chắc muốn xác nhận đơn đặt sân này?',
        cancel: 'Bạn có chắc muốn hủy đơn đặt sân này?',
        complete: 'Bạn có chắc muốn đánh dấu đơn này là hoàn thành?'
    };

    document.getElementById('modal-title').textContent = action === 'confirm' ? 'Xác nhận đơn' : action === 'cancel' ? 'Hủy đơn' : 'Hoàn thành đơn';
    document.getElementById('modal-message').textContent = messages[action];
    document.getElementById('reason-group').classList.toggle('hidden', action !== 'cancel');
    document.getElementById('confirm-action-btn').className = action === 'cancel' ? 'btn btn-danger' : 'btn btn-primary';

    showModal('action-modal');
}

async function executeAction() {
    const btn = document.getElementById('confirm-action-btn');
    const reason = document.getElementById('cancel-reason').value.trim();

    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
        await api.put(`/admin/bookings/${currentBookingId}`, {
            action: currentAction,
            reason: currentAction === 'cancel' ? reason : undefined
        });

        hideModal('action-modal');
        showAlert('Thao tác thành công!', 'success');
        loadBookings();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận';
        currentBookingId = null;
        currentAction = null;
    }
}
