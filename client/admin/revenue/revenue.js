// Admin Revenue Page

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!requireAdmin()) return;
    loadRevenueData();
});

async function loadRevenueData() {
    try {
        const data = await api.get('/admin/revenue');

        document.getElementById('total-revenue').textContent = formatPrice(data.totalRevenue);
        document.getElementById('completed-bookings').textContent = data.bookingStats.completed;
        document.getElementById('confirmed-bookings').textContent = data.bookingStats.confirmed;
        document.getElementById('cancelled-bookings').textContent = data.bookingStats.cancelled;

        // Revenue by court
        const courtTbody = document.getElementById('revenue-by-court');
        courtTbody.innerHTML = data.revenueByCourt.map(c => `
      <tr>
        <td>${c.court_name}</td>
        <td>${c.booking_count}</td>
        <td>${formatPrice(c.revenue)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="text-muted">Chưa có dữ liệu</td></tr>';

        // Revenue by month
        const monthTbody = document.getElementById('revenue-by-month');
        monthTbody.innerHTML = data.revenueByMonth.map(m => `
      <tr>
        <td>${m.month}</td>
        <td>${formatPrice(m.revenue)}</td>
      </tr>
    `).join('') || '<tr><td colspan="2" class="text-muted">Chưa có dữ liệu</td></tr>';
    } catch (error) {
        showAlert('Có lỗi khi tải dữ liệu', 'error');
    }
}
