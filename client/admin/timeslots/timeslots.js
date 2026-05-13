/**
 * Admin Timeslots — Quản lý khung giờ toàn cục
 * Slots dùng chung cho tất cả sân (global slots)
 */

let deletingSlotId   = null;
let deletingSlotName = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;
    loadSlots();
});

// ── Load danh sách slots ──────────────────────────────────
async function loadSlots() {
    const tbody = document.getElementById('slots-list');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải...</td></tr>';

    try {
        const slots = await api.get('/admin/slots');

        if (slots.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Chưa có khung giờ nào</td></tr>';
            return;
        }

        tbody.innerHTML = slots.map(s => {
            const modifierLabel = {
                '0.80': '<span class="badge badge-secondary">0.8× Thấp điểm</span>',
                '1.00': '<span class="badge badge-success">1.0× Bình thường</span>',
                '1.20': '<span class="badge badge-warning">1.2× Cao điểm</span>',
                '1.50': '<span class="badge badge-danger">1.5× Đặc biệt</span>'
            };
            const modKey   = parseFloat(s.price_modifier).toFixed(2);
            const modBadge = modifierLabel[modKey] || `<span class="badge badge-secondary">${s.price_modifier}×</span>`;

            return `
            <tr>
                <td>#${s.id}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.start_time}</td>
                <td>${s.end_time}</td>
                <td>${s.duration_hours}h</td>
                <td>${modBadge}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="editSlot(${s.id})">Sửa</button>
                    <button class="btn btn-danger btn-sm"    onclick="openDeleteModal(${s.id}, '${s.name.replace(/'/g,"\\'")}')">Xóa</button>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
        showAlert('Không thể tải danh sách khung giờ', 'error');
    }
}

// ── Mở modal thêm mới ────────────────────────────────────
function openSlotModal() {
    document.getElementById('slot-modal-title').textContent = 'Thêm khung giờ';
    document.getElementById('slot-id').value       = '';
    document.getElementById('slot-name').value     = '';
    document.getElementById('slot-start').value    = '';
    document.getElementById('slot-end').value      = '';
    document.getElementById('slot-duration').value = '1.5';
    document.getElementById('slot-modifier').value = '1.0';
    showModal('slot-modal');
}

// ── Mở modal chỉnh sửa ──────────────────────────────────
async function editSlot(slotId) {
    try {
        // Lấy danh sách và tìm slot cần sửa
        const slots = await api.get('/admin/slots');
        const slot  = slots.find(s => s.id === slotId);
        if (!slot) { showAlert('Không tìm thấy khung giờ', 'error'); return; }

        document.getElementById('slot-modal-title').textContent = 'Sửa khung giờ';
        document.getElementById('slot-id').value       = slot.id;
        document.getElementById('slot-name').value     = slot.name;
        document.getElementById('slot-start').value    = slot.start_time;
        document.getElementById('slot-end').value      = slot.end_time;
        document.getElementById('slot-duration').value = slot.duration_hours;
        document.getElementById('slot-modifier').value = parseFloat(slot.price_modifier).toFixed(1);

        showModal('slot-modal');
    } catch (error) {
        showAlert('Không thể tải thông tin khung giờ', 'error');
    }
}

// ── Lưu (thêm/sửa) ──────────────────────────────────────
async function saveSlot() {
    const slotId = document.getElementById('slot-id').value;
    const name     = document.getElementById('slot-name').value.trim();
    const start    = document.getElementById('slot-start').value;
    const end      = document.getElementById('slot-end').value;
    const duration = parseFloat(document.getElementById('slot-duration').value);
    const modifier = parseFloat(document.getElementById('slot-modifier').value);

    if (!name || !start || !end) {
        showAlert('Vui lòng điền đủ Tên ca, Giờ bắt đầu và Giờ kết thúc', 'warning');
        return;
    }

    const btn = document.getElementById('save-slot-btn');
    btn.disabled    = true;
    btn.textContent = 'Đang lưu...';

    try {
        const payload = {
            name,
            start_time: start,
            end_time:   end,
            duration_hours:  duration || 1.5,
            price_modifier:  modifier || 1.0
        };

        if (slotId) {
            await api.put(`/admin/slots/${slotId}`, payload);
            showAlert('Cập nhật khung giờ thành công!', 'success');
        } else {
            await api.post('/admin/slots', payload);
            showAlert('Thêm khung giờ thành công!', 'success');
        }

        hideModal('slot-modal');
        loadSlots();
    } catch (error) {
        showAlert(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Lưu';
    }
}

// ── Xóa ──────────────────────────────────────────────────
function openDeleteModal(slotId, slotName) {
    deletingSlotId   = slotId;
    deletingSlotName = slotName;
    document.getElementById('delete-slot-name').textContent = slotName;
    showModal('delete-modal');
}

async function confirmDeleteSlot() {
    if (!deletingSlotId) return;

    const btn = document.getElementById('confirm-delete-btn');
    btn.disabled    = true;
    btn.textContent = 'Đang xóa...';

    try {
        await api.delete(`/admin/slots/${deletingSlotId}`);
        hideModal('delete-modal');
        showAlert(`Đã xóa khung giờ "${deletingSlotName}"`, 'success');
        loadSlots();
    } catch (error) {
        showAlert(error.message || 'Không thể xóa khung giờ', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Xóa';
        deletingSlotId  = null;
    }
}
