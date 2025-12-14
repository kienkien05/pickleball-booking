// Profile page functionality

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    loadProfile();

    // Save profile
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProfile();
    });

    // Delete account button
    document.getElementById('delete-btn').addEventListener('click', () => {
        showModal('delete-modal');
    });

    // Confirm delete
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        await deleteAccount();
    });
});

async function loadProfile() {
    try {
        const user = await api.get('/users/profile');

        // Update form
        document.getElementById('full_name').value = user.full_name;
        document.getElementById('email').value = user.email;
        document.getElementById('phone').value = user.phone || '';

        // Update sidebar
        document.getElementById('user-avatar').textContent = user.full_name.charAt(0).toUpperCase();
        document.getElementById('user-name-display').textContent = user.full_name;
        document.getElementById('user-email-display').textContent = user.email;
        document.getElementById('user-created').textContent = formatDate(user.created_at);

        // Update navigation
        const userName = document.querySelector('.user-name');
        if (userName) userName.textContent = user.full_name;
    } catch (error) {
        showAlert('Không thể tải thông tin người dùng', 'error');
    }
}

async function saveProfile() {
    const form = document.getElementById('profile-form');
    const saveBtn = document.getElementById('save-btn');

    clearFieldErrors(form);

    const full_name = form.full_name.value.trim();
    const phone = form.phone.value.trim();
    const current_password = form.current_password.value;
    const new_password = form.new_password.value;

    // Validate
    if (!full_name) {
        showFieldError(form.full_name, 'Vui lòng nhập họ tên');
        return;
    }

    if (phone && !isValidPhone(phone)) {
        showFieldError(form.phone, 'Số điện thoại không hợp lệ');
        return;
    }

    if (new_password && !current_password) {
        showFieldError(form.current_password, 'Vui lòng nhập mật khẩu hiện tại');
        return;
    }

    if (new_password && new_password.length < 6) {
        showFieldError(form.new_password, 'Mật khẩu mới tối thiểu 6 ký tự');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu...';

    try {
        await api.put('/users/profile', {
            full_name,
            phone: phone || null,
            current_password: current_password || undefined,
            new_password: new_password || undefined
        });

        showAlert('Cập nhật thông tin thành công!', 'success');

        // Update localStorage
        const user = getCurrentUser();
        user.full_name = full_name;
        localStorage.setItem('user', JSON.stringify(user));

        // Clear password fields
        form.current_password.value = '';
        form.new_password.value = '';

        // Reload profile
        loadProfile();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lưu thay đổi';
    }
}

async function deleteAccount() {
    const password = document.getElementById('delete_password').value;

    if (!password) {
        showFieldError(document.getElementById('delete_password'), 'Vui lòng nhập mật khẩu');
        return;
    }

    const confirmBtn = document.getElementById('confirm-delete-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Đang xóa...';

    try {
        await api.delete('/users/profile', { password });

        clearAuth();
        showAlert('Tài khoản đã được xóa', 'success');

        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    } catch (error) {
        showAlert(error.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xóa tài khoản';
    }
}
