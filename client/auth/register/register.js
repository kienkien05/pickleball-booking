// Register page functionality

document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already logged in
    if (isLoggedIn()) {
        window.location.href = '/';
        return;
    }

    const form = document.getElementById('register-form');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        clearFieldErrors(form);

        const full_name = form.full_name.value.trim();
        const email = form.email.value.trim();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const confirm_password = form.confirm_password.value;

        // Validate
        let hasError = false;

        if (!full_name) {
            showFieldError(form.full_name, 'Vui lòng nhập họ tên');
            hasError = true;
        }

        if (!email) {
            showFieldError(form.email, 'Vui lòng nhập email');
            hasError = true;
        } else if (!isValidEmail(email)) {
            showFieldError(form.email, 'Email không hợp lệ');
            hasError = true;
        }

        if (phone && !isValidPhone(phone)) {
            showFieldError(form.phone, 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)');
            hasError = true;
        }

        if (!password) {
            showFieldError(form.password, 'Vui lòng nhập mật khẩu');
            hasError = true;
        } else if (password.length < 6) {
            showFieldError(form.password, 'Mật khẩu tối thiểu 6 ký tự');
            hasError = true;
        }

        if (password !== confirm_password) {
            showFieldError(form.confirm_password, 'Mật khẩu xác nhận không khớp');
            hasError = true;
        }

        if (hasError) return;

        // Submit
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng ký...';

        try {
            await api.post('/auth/register', {
                full_name,
                email,
                phone: phone || null,
                password
            });

            showAlert('Đăng ký thành công! Vui lòng đăng nhập.', 'success');

            setTimeout(() => {
                window.location.href = '/auth/login/login.html';
            }, 1500);
        } catch (error) {
            showAlert(error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng ký';
        }
    });
});
