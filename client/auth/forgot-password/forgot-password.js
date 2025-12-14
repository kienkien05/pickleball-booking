// Forgot password page functionality

document.addEventListener('DOMContentLoaded', () => {
    const emailForm = document.getElementById('email-form');
    const resetForm = document.getElementById('reset-form');
    const successMessage = document.getElementById('success-message');
    const emailSubmitBtn = document.getElementById('email-submit-btn');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');

    let userEmail = '';

    // Step 1: Submit email to get reset token
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        clearFieldErrors(emailForm);

        const email = emailForm.email.value.trim();

        if (!email) {
            showFieldError(emailForm.email, 'Vui lòng nhập email');
            return;
        }

        if (!isValidEmail(email)) {
            showFieldError(emailForm.email, 'Email không hợp lệ');
            return;
        }

        emailSubmitBtn.disabled = true;
        emailSubmitBtn.textContent = 'Đang gửi...';

        try {
            const data = await api.post('/auth/forgot-password', { email });

            userEmail = email;

            // Show reset form
            emailForm.classList.add('hidden');
            resetForm.classList.remove('hidden');

            // For development: show the token in alert
            if (data.dev_token) {
                showAlert(`[DEV] Mã xác nhận: ${data.dev_token}`, 'info');
            } else {
                showAlert('Mã xác nhận đã được gửi đến email của bạn', 'success');
            }
        } catch (error) {
            showAlert(error.message, 'error');
            emailSubmitBtn.disabled = false;
            emailSubmitBtn.textContent = 'Gửi mã xác nhận';
        }
    });

    // Step 2: Submit reset token and new password
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        clearFieldErrors(resetForm);

        const token = resetForm.token.value.trim();
        const new_password = resetForm.new_password.value;
        const confirm_password = resetForm.confirm_password.value;

        let hasError = false;

        if (!token || token.length !== 6) {
            showFieldError(resetForm.token, 'Vui lòng nhập mã 6 số');
            hasError = true;
        }

        if (!new_password) {
            showFieldError(resetForm.new_password, 'Vui lòng nhập mật khẩu mới');
            hasError = true;
        } else if (new_password.length < 6) {
            showFieldError(resetForm.new_password, 'Mật khẩu tối thiểu 6 ký tự');
            hasError = true;
        }

        if (new_password !== confirm_password) {
            showFieldError(resetForm.confirm_password, 'Mật khẩu xác nhận không khớp');
            hasError = true;
        }

        if (hasError) return;

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = 'Đang xử lý...';

        try {
            await api.post('/auth/reset-password', {
                email: userEmail,
                token,
                new_password
            });

            // Show success message
            resetForm.classList.add('hidden');
            successMessage.classList.remove('hidden');
            document.querySelector('.auth-footer').classList.add('hidden');
        } catch (error) {
            showAlert(error.message, 'error');
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = 'Đổi mật khẩu';
        }
    });
});
