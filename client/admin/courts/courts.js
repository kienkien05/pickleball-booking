// Admin Courts Page

let editingCourtId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    loadDistricts();
    loadCourts();

    document.getElementById('save-court-btn').addEventListener('click', saveCourt);
});

async function loadDistricts() {
    try {
        const districts = await api.get('/courts/districts');
        const select = document.getElementById('court-district');
        select.innerHTML = '<option value="">-- Chọn quận --</option>' +
            districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    } catch (error) {
        console.error('Load districts error:', error);
    }
}

async function loadCourts() {
    const tbody = document.getElementById('courts-list');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Đang tải...</td></tr>';

    try {
        const courts = await api.get('/courts');

        if (courts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Chưa có sân nào</td></tr>';
            return;
        }

        tbody.innerHTML = courts.map(c => `
      <tr>
        <td>#${c.id}</td>
        <td>${c.name}</td>
        <td>${c.address}, ${c.district_name}</td>
        <td>${formatPrice(c.price_per_hour)}</td>
        <td>
          <span class="badge ${c.is_active ? 'badge-success' : 'badge-secondary'}">
            ${c.is_active ? 'Hoạt động' : 'Tạm ngưng'}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editCourt(${c.id})">Sửa</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCourt(${c.id})">Xóa</button>
        </td>
      </tr>
    `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Có lỗi xảy ra</td></tr>';
    }
}

function openCourtModal() {
    editingCourtId = null;
    document.getElementById('court-modal-title').textContent = 'Thêm sân mới';
    document.getElementById('court-form').reset();
    showModal('court-modal');
}

async function editCourt(courtId) {
    try {
        const court = await api.get(`/courts/${courtId}`);
        editingCourtId = courtId;

        document.getElementById('court-modal-title').textContent = 'Sửa thông tin sân';
        document.getElementById('court-id').value = courtId;
        document.getElementById('court-name').value = court.name;
        document.getElementById('court-address').value = court.address;
        document.getElementById('court-district').value = court.district_id;
        document.getElementById('court-price').value = court.price_per_hour;
        document.getElementById('court-description').value = court.description || '';
        document.getElementById('court-image').value = court.image_url || '';

        showModal('court-modal');
    } catch (error) {
        showAlert('Không thể tải thông tin sân', 'error');
    }
}

async function saveCourt() {
    const btn = document.getElementById('save-court-btn');
    const data = {
        name: document.getElementById('court-name').value.trim(),
        address: document.getElementById('court-address').value.trim(),
        district_id: parseInt(document.getElementById('court-district').value),
        price_per_hour: parseFloat(document.getElementById('court-price').value),
        description: document.getElementById('court-description').value.trim() || null,
        image_url: document.getElementById('court-image').value.trim() || null
    };

    if (!data.name || !data.address || !data.district_id || !data.price_per_hour) {
        showAlert('Vui lòng điền đầy đủ thông tin', 'warning');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    try {
        if (editingCourtId) {
            await api.put(`/admin/courts/${editingCourtId}`, data);
        } else {
            await api.post('/admin/courts', data);
        }

        hideModal('court-modal');
        showAlert(editingCourtId ? 'Cập nhật sân thành công!' : 'Thêm sân thành công!', 'success');
        loadCourts();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Lưu';
    }
}

async function deleteCourt(courtId) {
    if (!confirm('Bạn có chắc muốn xóa sân này?')) return;

    try {
        await api.delete(`/admin/courts/${courtId}`);
        showAlert('Xóa sân thành công!', 'success');
        loadCourts();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}
