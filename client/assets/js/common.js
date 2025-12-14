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
    const date = new Date(dateStr);
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
        'pending': { text: 'Chờ xác nhận', class: 'badge-warning' },
        'confirmed': { text: 'Đã xác nhận', class: 'badge-primary' },
        'cancelled': { text: 'Đã hủy', class: 'badge-danger' },
        'completed': { text: 'Hoàn thành', class: 'badge-success' }
    };

    const info = statusMap[status] || { text: status, class: 'badge-secondary' };
    return `<span class="badge ${info.class}">${info.text}</span>`;
}

// Generate star rating HTML
function getStarsHTML(rating, max = 5) {
    let html = '<div class="stars">';
    for (let i = 1; i <= max; i++) {
        html += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
    }
    html += '</div>';
    return html;
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
