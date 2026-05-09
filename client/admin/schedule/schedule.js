/**
 * @file schedule.js
 * @description Xử lý hiển thị thời khóa biểu đặt sân cho Admin
 */

document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra quyền Admin
    if (!requireAdmin()) return;

    // Khởi tạo các DOM elements
    const weekPicker = document.getElementById('week-picker');
    const courtFilter = document.getElementById('court-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const timetableBody = document.getElementById('timetable-body');
    const timetableHeader = document.getElementById('timetable-header');

    // Biến lưu trữ dữ liệu
    let currentSlots = [];
    let currentCourts = [];
    let currentBookings = [];

    /**
     * Khởi tạo trang
     */
    async function init() {
        // Thiết lập tuần hiện tại cho input week
        const now = new Date();
        weekPicker.value = getWeekString(now);

        // Load danh sách sân và khung giờ trước
        await Promise.all([
            loadCourts(),
            loadSlots()
        ]);

        // Load dữ liệu đặt sân
        await fetchScheduleData();

        // Gắn sự kiện
        weekPicker.addEventListener('change', fetchScheduleData);
        courtFilter.addEventListener('change', fetchScheduleData);
        refreshBtn.addEventListener('click', fetchScheduleData);
    }

    /**
     * Lấy chuỗi định dạng YYYY-Www từ đối tượng Date
     */
    function getWeekString(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }

    /**
     * Tính toán ngày bắt đầu (Thứ 2) và kết thúc (Chủ Nhật) của tuần từ giá trị input week
     */
    function getWeekRange(weekStr) {
        const [year, week] = weekStr.split('-W').map(Number);
        
        // Ngày 4 tháng 1 luôn nằm trong tuần 1
        const firstDayOfYear = new Date(year, 0, 4);
        const dayOfFirstDay = firstDayOfYear.getDay() || 7;
        
        // Tìm ngày Thứ 2 của tuần 1
        const mondayOfFirstWeek = new Date(firstDayOfYear);
        mondayOfFirstWeek.setDate(firstDayOfYear.getDate() - (dayOfFirstDay - 1));
        
        // Tìm ngày Thứ 2 của tuần được chọn
        const startDate = new Date(mondayOfFirstWeek);
        startDate.setDate(mondayOfFirstWeek.getDate() + (week - 1) * 7);
        
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        return {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
            days: Array.from({length: 7}, (_, i) => {
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + i);
                return d.toISOString().split('T')[0];
            })
        };
    }

    /**
     * Tải danh sách sân để đổ vào select filter
     */
    async function loadCourts() {
        try {
            const data = await api.get('/admin/courts');
            currentCourts = data || [];
            
            // Render options
            courtFilter.innerHTML = '<option value="">Tất cả sân</option>' + 
                currentCourts.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
        } catch (error) {
            console.error('Lỗi tải danh sách sân:', error);
            showAlert('Không thể tải danh sách sân', 'error');
        }
    }

    /**
     * Tải danh sách khung giờ cố định của hệ thống
     */
    async function loadSlots() {
        try {
            const data = await api.get('/admin/slots');
            currentSlots = data || [];
        } catch (error) {
            console.error('Lỗi tải danh sách khung giờ:', error);
            showAlert('Không thể tải danh sách khung giờ', 'error');
        }
    }

    /**
     * Gọi API lấy dữ liệu đặt sân theo tuần và sân đã chọn
     */
    async function fetchScheduleData() {
        const weekStr = weekPicker.value;
        const courtId = courtFilter.value;

        if (!weekStr) return;

        const { start, end, days } = getWeekRange(weekStr);

        try {
            showLoading(timetableBody);
            
            // Gọi API mới tạo ở Backend
            const response = await api.get(`/admin/schedule-board?start_date=${start}&end_date=${end}&court_id=${courtId || ''}`);
            currentBookings = response.data || [];

            renderTimetable(days);
        } catch (error) {
            console.error('Lỗi tải lịch đặt sân:', error);
            timetableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Lỗi: ${error.message}</td></tr>`;
        }
    }

    /**
     * Render cấu trúc bảng và đổ dữ liệu booking vào các ô
     */
    function renderTimetable(days) {
        // 1. Cập nhật ngày tháng trên header
        const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
        let headerHTML = `<th class="time-col">Khung giờ</th>`;
        days.forEach((date, index) => {
            const formattedDate = formatDate(date);
            headerHTML += `<th>${dayLabels[index]}<span class="date-label">${formattedDate}</span></th>`;
        });
        timetableHeader.innerHTML = headerHTML;

        // 2. Render thân bảng theo từng khung giờ (Rows)
        if (currentSlots.length === 0) {
            timetableBody.innerHTML = `<tr><td colspan="8" class="text-center">Chưa cấu hình khung giờ hệ thống</td></tr>`;
            return;
        }

        let bodyHTML = '';
        currentSlots.forEach(slot => {
            bodyHTML += `<tr>`;
            // Cột khung giờ
            bodyHTML += `<td class="time-col">${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}</td>`;

            // 7 cột tương ứng 7 ngày
            days.forEach(date => {
                const cellBookings = currentBookings.filter(b => 
                    b.slot_id === slot.id && 
                    b.booking_date.split('T')[0] === date
                );

                bodyHTML += `<td data-date="${date}" data-slot="${slot.id}">`;
                
                cellBookings.forEach(booking => {
                    const vipClass = booking.is_vip ? 'booking-vip' : 'booking-regular';
                    const autoTag = booking.is_auto_booking ? `<span class="booking-auto">Auto</span>` : '';
                    
                    // Tooltip chi tiết
                    const tooltip = `Mã đơn: #${booking.booking_id}\nSân: ${booking.court_name}\nKhách: ${booking.user_name}\nVIP: ${booking.is_vip ? 'Có' : 'Không'}`;

                    bodyHTML += `
                        <div class="booking-item ${vipClass}" title="${escapeHTML(tooltip)}">
                            ${autoTag}
                            <span class="booking-name">${escapeHTML(booking.user_name)}</span>
                            <span class="booking-status">${escapeHTML(booking.court_name)}</span>
                        </div>
                    `;
                });

                bodyHTML += `</td>`;
            });

            bodyHTML += `</tr>`;
        });

        timetableBody.innerHTML = bodyHTML;
    }

    // Chạy khởi tạo
    init();
});
