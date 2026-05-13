/* ========================================
   PICKLEBALL - Common JavaScript Utilities
   ======================================== */

// API Base URL
const API_URL = '/api';

// ==================== AUTH ====================

// Get current user from localStorage
function getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

// Get auth token
function getToken() {
    return localStorage.getItem('token');
}

// Check if user is logged in
function isLoggedIn() {
    return !!getToken();
}

// Check if user is admin
function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

// Save user data after login
function saveAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

// Clear auth data (logout)
function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/auth/login/login.html';
        return false;
    }
    return true;
}

// Redirect to admin dashboard if not admin
function requireAdmin() {
    if (!isAdmin()) {
        window.location.href = '/';
        return false;
    }
    return true;
}

// ==================== API CALLS ====================

// Make API request with auth header
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        },
        ...options
    };

    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Có lỗi xảy ra');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Convenience methods
const api = {
    get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
    post: (endpoint, body) => apiRequest(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => apiRequest(endpoint, { method: 'PUT', body }),
    delete: (endpoint, body) => apiRequest(endpoint, { method: 'DELETE', body })
};

// ==================== UI HELPERS ====================

// Show alert message
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    // Find or create alert container
    let container = document.querySelector('.alert-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'alert-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        document.body.appendChild(container);
    }

    container.appendChild(alertDiv);

    // Auto remove after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
        if (container.children.length === 0) {
            container.remove();
        }
    }, 5000);
}

// Show loading spinner
function showLoading(container) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = '<div class="spinner"></div>';
    container.innerHTML = '';
    container.appendChild(loadingDiv);
}

// Hide loading
function hideLoading(container) {
    const loading = container.querySelector('.loading');
    if (loading) {
        loading.remove();
    }
}

// Format price to VND
function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(price);
}

// Format date
function formatDate(dateStr) {
    const raw = String(dateStr || '');
    const dateOnly = raw.split(/[T\s]/)[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(dateStr);

    if (Number.isNaN(date.getTime())) return raw || '--';

    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Format datetime
function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Get status badge HTML
function getStatusBadge(status) {
    const statusMap = {
        'pending':     { text: 'Chờ xác nhận', class: 'badge-warning' },
        'confirmed':   { text: 'Đã xác nhận',  class: 'badge-primary' },
        'in_progress': { text: 'Đang chơi',    class: 'badge-info' },
        'completed':   { text: 'Hoàn thành',   class: 'badge-success' },
        'cancelled':   { text: 'Đã hủy',       class: 'badge-danger' }
    };

    const info = statusMap[status] || { text: status, class: 'badge-secondary' };
    return `<span class="badge ${info.class}">${info.text}</span>`;
}

// Generate star rating HTML
function getStarsHTML(rating, max = 5) {
    let html = '<div class="stars">';
    for (let i = 1; i <= max; i++) {
        html += `<span class="star ${i <= rating ? 'filled' : ''}">&#9733;</span>`;
    }
    html += '</div>';
    return html;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== MODAL ====================

// Show modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

// Hide modal
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
        document.body.style.overflow = '';
    }
});

// ==================== FORM HELPERS ====================

// Get form data as object
function getFormData(form) {
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
        data[key] = value;
    });
    return data;
}

// Validate email
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate phone
function isValidPhone(phone) {
    return /^0\d{9}$/.test(phone);
}

// Show form error
function showFieldError(field, message) {
    field.classList.add('error');
    const errorDiv = field.parentElement.querySelector('.form-error');
    if (errorDiv) {
        errorDiv.textContent = message;
    } else {
        const newError = document.createElement('div');
        newError.className = 'form-error';
        newError.textContent = message;
        field.parentElement.appendChild(newError);
    }
}

// Clear form errors
function clearFieldErrors(form) {
    form.querySelectorAll('.form-control.error').forEach(field => {
        field.classList.remove('error');
    });
    form.querySelectorAll('.form-error').forEach(error => {
        error.textContent = '';
    });
}

// ==================== NAVIGATION ====================

// Update navigation based on auth state
function updateNavigation() {
    const user = getCurrentUser();
    const authNav = document.querySelector('.auth-nav');
    const userNav = document.querySelector('.user-nav');

    if (authNav && userNav) {
        if (isLoggedIn()) {
            authNav.classList.add('hidden');
            userNav.classList.remove('hidden');

            const userName = userNav.querySelector('.user-name');
            if (userName && user) {
                userName.textContent = user.full_name;
            }
        } else {
            authNav.classList.remove('hidden');
            userNav.classList.add('hidden');
        }
    }
}

// ==================== NOTIFICATIONS ====================

function getNotificationIcon() {
    return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
    `;
}

function initNotifications() {
    if (!isLoggedIn()) return;

    const userNav = document.querySelector('.user-nav');
    if (!userNav || userNav.querySelector('.notification-menu')) return;

    const notificationMenu = document.createElement('div');
    notificationMenu.className = 'notification-menu';
    notificationMenu.innerHTML = `
        <button class="notification-btn" type="button" aria-label="Thông báo" title="Thông báo">
            ${getNotificationIcon()}
            <span class="notification-count hidden">0</span>
        </button>
        <div class="notification-dropdown">
            <div class="notification-header">
                <strong>Thông báo</strong>
                <button type="button" class="notification-read-all">Đọc tất cả</button>
            </div>
            <div class="notification-list">
                <div class="notification-empty">Đang tải...</div>
            </div>
        </div>
    `;

    const userMenu = userNav.querySelector('.user-menu');
    if (userMenu) {
        userNav.insertBefore(notificationMenu, userMenu);
    } else {
        userNav.appendChild(notificationMenu);
    }

    const button = notificationMenu.querySelector('.notification-btn');
    const dropdown = notificationMenu.querySelector('.notification-dropdown');
    const readAllBtn = notificationMenu.querySelector('.notification-read-all');

    button.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
        if (dropdown.classList.contains('show')) {
            await loadNotifications();
        }
    });

    dropdown.addEventListener('click', e => e.stopPropagation());

    readAllBtn.addEventListener('click', async () => {
        try {
            await api.put('/users/notifications/read-all', {});
            await loadNotifications();
        } catch (error) {
            showAlert('Không thể cập nhật thông báo', 'error');
        }
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('show');
    });

    loadNotifications();
}

async function loadNotifications() {
    const menu = document.querySelector('.notification-menu');
    if (!menu) return;

    const list = menu.querySelector('.notification-list');
    const count = menu.querySelector('.notification-count');

    try {
        const response = await api.get('/users/notifications');
        const notifications = response.data || [];
        const unreadCount = response.unread_count || 0;

        if (unreadCount > 0) {
            count.textContent = unreadCount > 99 ? '99+' : unreadCount;
            count.classList.remove('hidden');
        } else {
            count.classList.add('hidden');
        }

        if (notifications.length === 0) {
            list.innerHTML = '<div class="notification-empty">Chưa có thông báo nào.</div>';
            return;
        }

        list.innerHTML = notifications.map(item => `
            <button type="button"
                    class="notification-item ${item.is_read ? '' : 'unread'}"
                    data-id="${item.id}"
                    data-booking-id="${item.booking_id || ''}">
                <div class="notification-title">${escapeHTML(item.title)}</div>
                <div class="notification-message">${escapeHTML(item.message)}</div>
                <div class="notification-time">${formatDateTime(item.created_at)}</div>
            </button>
        `).join('');

        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                try {
                    await api.put(`/users/notifications/${id}/read`, {});
                } catch (error) {
                    // UI navigation still works even if marking read fails.
                }
                const bookingId = item.dataset.bookingId;
                if (bookingId) {
                    window.location.href = '/user/history/history.html';
                } else {
                    await loadNotifications();
                }
            });
        });
    } catch (error) {
        list.innerHTML = '<div class="notification-empty text-danger">Không thể tải thông báo.</div>';
    }
}

// Logout handler
async function handleLogout() {
    try {
        await api.post('/auth/logout');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuth();
        window.location.href = '/';
    }
}

// ==================== INIT ====================

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateNavigation();
    initNotifications();

    // User dropdown toggle
    const userMenuBtn = document.querySelector('.user-menu-btn');
    const userDropdown = document.querySelector('.user-dropdown');

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            userDropdown.classList.remove('show');
        });
    }

    // Logout buttons
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Bạn có chắc muốn đăng xuất?')) {
                handleLogout();
            }
        });
    });
});
