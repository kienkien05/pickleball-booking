/**
 * Admin Customers Page — Quản lý khách hàng
 * Thêm: Toggle VIP, Reset cancel_count, Lock/Unlock
 */

let currentCustomerId = null;
let currentAction     = null;
let currentLockState  = false;
let currentVipState   = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;
    loadCustomers();

    document.getElementById('confirm-btn').addEventListener('click', executeAction);
});

async function loadCustomers() {
    const tbody = document.getElementById('customers-list');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Đang tải...</td></tr>';

    try {
        const customers = await api.get('/admin/customers');

        if (customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Chưa có khách hàng nào</td></tr>';
            return;
        }

        tbody.innerHTML = customers.map(c => {
            const cancelWarning = c.cancel_count >= 3
                ? `<span class="badge badge-danger" style="font-size:0.7rem;">Hủy ${c.cancel_count}x</span>`
                : c.cancel_count > 0
                    ? `<span class="badge badge-warning" style="font-size:0.7rem;">Hủy ${c.cancel_count}x</span>`
                    : '<span class="text-muted">0</span>';

            return `
            <tr>
                <td>#${c.id}</td>
                <td>
                    ${c.full_name}
                    ${c.is_vip ? '<span class="badge badge-primary" style="font-size:0.7rem;margin-left:0.35rem;">VIP</span>' : ''}
                </td>
                <td>${c.email}</td>
                <td>${c.phone || '-'}</td>
                <td>${c.total_bookings || 0}</td>
                <td>
                    ${cancelWarning}
                    ${c.cancel_count >= 3
                        ? `<button class="btn btn-sm btn-secondary" style="font-size:0.7rem;padding:2px 6px;"
                                   onclick="openModal(${c.id}, 'reset_cancels')">Reset</button>`
                        : ''}
                </td>
                <td>
                    <span class="badge ${c.is_locked ? 'badge-danger' : 'badge-success'}">
                        ${c.is_locked ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm ${c.is_vip ? 'btn-warning' : 'btn-primary'}"
                            onclick="openModal(${c.id}, 'vip', false, ${c.is_vip})"
                            title="${c.is_vip ? 'Hạ cấp VIP' : 'Nâng cấp VIP'}">
                        ${c.is_vip ? 'Hạ VIP' : 'Nâng VIP'}
                    </button>
                    <button class="btn btn-sm ${c.is_locked ? 'btn-success' : 'btn-warning'}"
                            onclick="openModal(${c.id}, 'lock', ${c.is_locked})">
                        ${c.is_locked ? 'Mở khóa' : 'Khóa'}
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
    }
}

function openModal(customerId, action, isLocked = false, isVip = false) {
    currentCustomerId = customerId;
    currentAction     = action;
    currentLockState  = isLocked;
    currentVipState   = isVip;

    const config = {
        lock: {
            title:   isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
            msg:     isLocked
                ? 'Mở khóa để người dùng có thể đăng nhập lại?'
                : 'Khóa tài khoản này? Người dùng sẽ bị đăng xuất ngay.',
            btnClass: isLocked ? 'btn btn-success' : 'btn btn-warning'
        },
        vip: {
            title:    isVip ? 'Hạ cấp khỏi VIP' : 'Nâng cấp VIP',
            msg:      isVip
                ? 'Hạ cấp khách hàng này khỏi VIP? (Thời hạn hủy sẽ tăng từ 1h → 3h)'
                : 'Nâng cấp lên VIP? Khách VIP được hủy sân đến 1h trước giờ chơi.',
            btnClass: isVip ? 'btn btn-secondary' : 'btn btn-primary'
        },
        reset_cancels: {
            title:    'Reset số lần hủy',
            msg:      'Đặt lại số lần hủy về 0? Khách hàng sẽ được đặt cọc trở lại.',
            btnClass: 'btn btn-success'
        }
    };

    const c = config[action];
    document.getElementById('modal-title').textContent   = c.title;
    document.getElementById('modal-message').textContent = c.msg;
    document.getElementById('confirm-btn').className      = c.btnClass;

    showModal('confirm-modal');
}

async function executeAction() {
    const btn = document.getElementById('confirm-btn');
    btn.disabled    = true;
    btn.textContent = 'Đang xử lý...';

    try {
        if (currentAction === 'lock') {
            await api.put(`/admin/customers/${currentCustomerId}/lock`, { lock: !currentLockState });
        } else if (currentAction === 'vip') {
            await api.put(`/admin/customers/${currentCustomerId}/vip`, { is_vip: !currentVipState });
        } else if (currentAction === 'reset_cancels') {
            await api.put(`/admin/customers/${currentCustomerId}/reset-cancels`, {});
        }

        hideModal('confirm-modal');
        showAlert('Thao tác thành công!', 'success');
        loadCustomers();
    } catch (error) {
        showAlert(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Xác nhận';
    }
}
