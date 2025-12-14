// Admin Customers Page

let currentCustomerId = null;
let currentAction = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;
    loadCustomers();

    document.getElementById('confirm-btn').addEventListener('click', executeAction);
});

async function loadCustomers() {
    const tbody = document.getElementById('customers-list');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải...</td></tr>';

    try {
        const customers = await api.get('/admin/customers');

        if (customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Chưa có khách hàng nào</td></tr>';
            return;
        }

        tbody.innerHTML = customers.map(c => `
      <tr>
        <td>#${c.id}</td>
        <td>${c.full_name}</td>
        <td>${c.email}</td>
        <td>${c.phone || '-'}</td>
        <td>${c.booking_count}</td>
        <td>
          <span class="badge ${c.is_locked ? 'badge-danger' : 'badge-success'}">
            ${c.is_locked ? 'Đã khóa' : 'Hoạt động'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm ${c.is_locked ? 'btn-success' : 'btn-warning'}" 
                  onclick="openModal(${c.id}, 'lock', ${c.is_locked})">
            ${c.is_locked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="openModal(${c.id}, 'delete')">Xóa</button>
        </td>
      </tr>
    `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
    }
}

function openModal(customerId, action, isLocked = false) {
    currentCustomerId = customerId;
    currentAction = action;

    if (action === 'lock') {
        document.getElementById('modal-title').textContent = isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản';
        document.getElementById('modal-message').textContent = isLocked
            ? 'Bạn có chắc muốn mở khóa tài khoản này?'
            : 'Bạn có chắc muốn khóa tài khoản này? Người dùng sẽ không thể đăng nhập.';
        document.getElementById('confirm-btn').className = isLocked ? 'btn btn-success' : 'btn btn-warning';
    } else {
        document.getElementById('modal-title').textContent = 'Xóa tài khoản';
        document.getElementById('modal-message').textContent = 'Bạn có chắc muốn xóa tài khoản này? Hành động này không thể hoàn tác.';
        document.getElementById('confirm-btn').className = 'btn btn-danger';
    }

    showModal('confirm-modal');
}

async function executeAction() {
    const btn = document.getElementById('confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
        if (currentAction === 'lock') {
            await api.put(`/admin/customers/${currentCustomerId}/lock`);
        } else {
            await api.delete(`/admin/customers/${currentCustomerId}`);
        }

        hideModal('confirm-modal');
        showAlert('Thao tác thành công!', 'success');
        loadCustomers();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận';
    }
}
