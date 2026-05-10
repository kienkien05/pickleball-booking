/**
 * Admin Equipment Page — Quản lý dịch vụ / thiết bị đi kèm khi đặt sân
 */

let equipmentItems = [];
let courts = [];
let editingEquipmentId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    await loadCourts();
    loadEquipment();

    document.getElementById('save-equipment-btn').addEventListener('click', saveEquipment);
    document.getElementById('court-filter').addEventListener('change', loadEquipment);
});

async function loadCourts() {
    try {
        courts = await api.get('/admin/courts');
        const filterSelect = document.getElementById('court-filter');
        const modalSelect = document.getElementById('equipment-court-id');

        const options = courts.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        filterSelect.innerHTML += options;
        modalSelect.innerHTML += options;
    } catch (error) {
        console.error('Không thể tải danh sách sân:', error);
    }
}

async function loadEquipment() {
    const tbody = document.getElementById('equipment-list');
    const courtId = document.getElementById('court-filter').value;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Đang tải...</td></tr>';

    try {
        const url = courtId ? `/admin/equipment?court_id=${courtId}` : '/admin/equipment';
        equipmentItems = await api.get(url);

        if (equipmentItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Chưa có dịch vụ đi kèm nào</td></tr>';
            return;
        }

        tbody.innerHTML = equipmentItems.map(item => `
            <tr>
                <td>#${item.id}</td>
                <td><span class="text-primary font-bold">${item.court_name || 'N/A'}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.description || '<span class="text-muted">Không có mô tả</span>'}</td>
                <td>${formatPrice(item.price_per_booking)}</td>
                <td>${item.available_quantity}</td>
                <td>
                    <span class="badge ${item.is_active ? 'badge-success' : 'badge-secondary'}">
                        ${item.is_active ? 'Đang phục vụ' : 'Tạm ngưng'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="editEquipment(${item.id})">Sửa</button>
                    <button class="btn ${item.is_active ? 'btn-warning' : 'btn-success'} btn-sm"
                            onclick="toggleEquipment(${item.id})">
                        ${item.is_active ? 'Tạm ngưng' : 'Mở lại'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
        showAlert('Không thể tải danh sách dịch vụ đi kèm', 'error');
    }
}

function openEquipmentModal() {
    editingEquipmentId = null;
    document.getElementById('equipment-modal-title').textContent = 'Thêm dịch vụ';
    document.getElementById('equipment-form').reset();
    document.getElementById('equipment-id').value = '';
    document.getElementById('equipment-active').value = 'true';
    showModal('equipment-modal');
}

function editEquipment(equipmentId) {
    const item = equipmentItems.find(e => e.id === equipmentId);
    if (!item) {
        showAlert('Không tìm thấy dịch vụ', 'error');
        return;
    }

    editingEquipmentId = equipmentId;
    document.getElementById('equipment-modal-title').textContent = 'Sửa dịch vụ';
    document.getElementById('equipment-id').value = item.id;
    document.getElementById('equipment-court-id').value = item.court_id || '';
    document.getElementById('equipment-name').value = item.name;
    document.getElementById('equipment-description').value = item.description || '';
    document.getElementById('equipment-price').value = item.price_per_booking;
    document.getElementById('equipment-quantity').value = item.available_quantity;
    document.getElementById('equipment-active').value = item.is_active ? 'true' : 'false';
    showModal('equipment-modal');
}

async function saveEquipment() {
    const btn = document.getElementById('save-equipment-btn');
    const payload = {
        court_id: parseInt(document.getElementById('equipment-court-id').value, 10),
        name: document.getElementById('equipment-name').value.trim(),
        description: document.getElementById('equipment-description').value.trim() || null,
        price_per_booking: parseFloat(document.getElementById('equipment-price').value),
        available_quantity: parseInt(document.getElementById('equipment-quantity').value, 10),
        is_active: document.getElementById('equipment-active').value === 'true'
    };

    if (!payload.court_id || !payload.name || Number.isNaN(payload.price_per_booking) || payload.price_per_booking < 0 ||
        Number.isNaN(payload.available_quantity) || payload.available_quantity < 0) {
        showAlert('Vui lòng chọn sân và nhập đầy đủ thông tin hợp lệ', 'warning');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    try {
        if (editingEquipmentId) {
            await api.put(`/admin/equipment/${editingEquipmentId}`, payload);
        } else {
            await api.post('/admin/equipment', payload);
        }

        hideModal('equipment-modal');
        showAlert(editingEquipmentId ? 'Cập nhật dịch vụ thành công!' : 'Thêm dịch vụ thành công!', 'success');
        loadEquipment();
    } catch (error) {
        showAlert(error.message || 'Không thể lưu dịch vụ', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Lưu';
    }
}

async function toggleEquipment(equipmentId) {
    const item = equipmentItems.find(e => e.id === equipmentId);
    if (!item) return;

    const payload = {
        court_id: item.court_id,
        name: item.name,
        description: item.description || null,
        price_per_booking: parseFloat(item.price_per_booking),
        available_quantity: parseInt(item.available_quantity, 10),
        is_active: !item.is_active
    };

    try {
        await api.put(`/admin/equipment/${equipmentId}`, payload);
        showAlert(payload.is_active ? 'Đã mở lại dịch vụ' : 'Đã tạm ngưng dịch vụ', 'success');
        loadEquipment();
    } catch (error) {
        showAlert(error.message || 'Không thể cập nhật trạng thái dịch vụ', 'error');
    }
}
