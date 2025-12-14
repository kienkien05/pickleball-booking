// Login page functionality

document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already logged in
    if (isLoggedIn()) {
        const user = getCurrentUser();
        if (user.role === 'admin') {
            window.location.href = '/admin/dashboard/dashboard.html';
        } else {
            window.location.href = '/';
        }
        return;
    }

    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        clearFieldErrors(form);

        const email = form.email.value.trim();
        const password = form.password.value;

        // Validate
        if (!email) {
            showFieldError(form.email, 'Vui lòng nhập email hoặc số điện thoại');
            return;
        }

        if (!password) {
            showFieldError(form.password, 'Vui lòng nhập mật khẩu');
            return;
        }

        // Submit
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng nhập...';

        try {
            const data = await api.post('/auth/login', { email, password });

            // Save auth data
            saveAuth(data.token, data.user);

            showAlert('Đăng nhập thành công!', 'success');

            // Redirect based on role
            setTimeout(() => {
                if (data.user.role === 'admin') {
                    window.location.href = '/admin/dashboard/dashboard.html';
                } else {
                    window.location.href = '/';
                }
            }, 500);
        } catch (error) {
            showAlert(error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng nhập';
        }
    });
});
