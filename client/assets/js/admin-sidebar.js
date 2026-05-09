/**
 * @file admin-sidebar.js
 * @description Quản lý Sidebar tập trung cho hệ thống Admin
 */

function renderAdminSidebar() {
    const sidebarContainer = document.querySelector('.admin-sidebar');
    if (!sidebarContainer) return;

    const currentPath = window.location.pathname;

    // Danh sách các menu item
    const menuItems = [
        { path: '/admin/dashboard/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
        { path: '/admin/schedule/schedule.html', icon: 'bi-calendar3', label: 'Lịch sân' },
        { path: '/admin/revenue/revenue.html', icon: 'bi-graph-up-arrow', label: 'Doanh thu' },
        { path: '/admin/orders/orders.html', icon: 'bi-clipboard-check', label: 'Đơn đặt sân' },
        { path: '/admin/customers/customers.html', icon: 'bi-people', label: 'Khách hàng' },
        { path: '/admin/courts/courts.html', icon: 'bi-building', label: 'Quản lý sân' },
        { path: '/admin/timeslots/timeslots.html', icon: 'bi-clock', label: 'Khung giờ' },
        { path: '/admin/equipment/equipment.html', icon: 'bi-bag-check', label: 'Dịch vụ đi kèm' },
        { path: '/admin/scanner/scanner.html', icon: 'bi-qr-code-scan', label: 'Quét mã QR' },
    ];

    const menuHTML = menuItems.map(item => {
        // Kiểm tra xem item có đang active không (so sánh path)
        const isActive = currentPath.includes(item.path) ? 'active' : '';
        return `<li><a href="${item.path}" class="${isActive}"><i class="bi ${item.icon}"></i> ${item.label}</a></li>`;
    }).join('');

    sidebarContainer.innerHTML = `
        <a href="/" class="admin-sidebar-logo">Pickleball Admin</a>
        <ul class="admin-nav">
            ${menuHTML}
            <li><a href="#" class="logout-btn"><i class="bi bi-box-arrow-right"></i> Đăng xuất</a></li>
        </ul>
    `;

    // Khởi tạo lại sự kiện logout vì sidebar vừa được render lại
    const logoutBtn = sidebarContainer.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Bạn có chắc muốn đăng xuất?')) {
                handleLogout();
            }
        });
    }
}

// Chạy ngay khi script được load hoặc khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAdminSidebar);
} else {
    renderAdminSidebar();
}
