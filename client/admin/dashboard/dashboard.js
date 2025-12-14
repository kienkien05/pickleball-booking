// Admin Dashboard

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;

    const user = getCurrentUser();
    document.getElementById('admin-name').textContent = user.full_name;

    loadDashboardData();
});

async function loadDashboardData() {
    try {
        // Load revenue stats
        const revenue = await api.get('/admin/revenue');
        document.getElementById('stat-revenue').textContent = formatPrice(revenue.totalRevenue);
        document.getElementById('stat-bookings').textContent = revenue.bookingStats.total;
        document.getElementById('stat-pending').textContent = revenue.bookingStats.pending;

        // Load customers count
        const customers = await api.get('/admin/customers');
        document.getElementById('stat-customers').textContent = customers.length;

        // Load recent bookings
        const bookings = await api.get('/admin/bookings');
        const tbody = document.getElementById('recent-bookings');

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Chưa có đơn đặt nào</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.slice(0, 5).map(b => `
      <tr>
        <td>#${b.id}</td>
        <td>${b.user_name}</td>
        <td>${b.court_name}</td>
        <td>${formatDate(b.booking_date)}</td>
        <td>${getStatusBadge(b.status)}</td>
        <td>${formatPrice(b.total_price)}</td>
      </tr>
    `).join('');
    } catch (error) {
        console.error('Dashboard error:', error);
        showAlert('Có lỗi khi tải dữ liệu', 'error');
    }
}
