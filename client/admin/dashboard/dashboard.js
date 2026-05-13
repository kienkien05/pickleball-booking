// Admin Dashboard

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    const user = getCurrentUser();
    if (document.getElementById('admin-name')) {
        document.getElementById('admin-name').textContent = user.full_name;
    }

    loadDashboardData();
});

async function loadDashboardData() {
    try {
        // Tải stats từ endpoint mới
        const stats = await api.get('/admin/stats');

        document.getElementById('stat-revenue').textContent   = formatPrice(stats.total_revenue || 0);
        document.getElementById('stat-bookings').textContent  = stats.total_bookings || 0;
        document.getElementById('stat-pending').textContent   = (stats.pending || 0) + (stats.confirmed || 0);
        document.getElementById('stat-customers').textContent = stats.total_users || 0;

        // Recent bookings
        const response = await api.get('/admin/bookings?limit=5');
        const bookings  = response.data || response;
        const tbody     = document.getElementById('recent-bookings');

        if (!bookings || bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Chưa có đơn đặt nào</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.slice(0, 5).map(b => `
            <tr>
                <td>#${b.id}</td>
                <td>${b.is_vip ? '⭐ ' : ''}${b.user_name || '--'}</td>
                <td>${b.court_name || '--'}</td>
                <td>${formatDate(b.booking_date)}</td>
                <td>${getStatusBadge(b.status)}</td>
                <td>${formatPrice(b.total_price)}</td>
            </tr>`).join('');

    } catch (error) {
        console.error('Dashboard error:', error);
        showAlert('Có lỗi khi tải dữ liệu dashboard', 'error');
    }
}
