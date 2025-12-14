// History page functionality

let cancelBookingId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    loadBookings();

    document.getElementById('confirm-cancel-btn').addEventListener('click', confirmCancel);
});

async function loadBookings() {
    const container = document.getElementById('bookings-list');
    showLoading(container);

    try {
        const bookings = await api.get('/bookings');

        if (bookings.length === 0) {
            container.innerHTML = `
        <div class="card text-center">
          <p class="text-muted">Bạn chưa có đơn đặt sân nào.</p>
          <a href="/user/search/search.html" class="btn btn-primary mt-2">Tìm sân ngay</a>
        </div>
      `;
            return;
        }

        container.innerHTML = bookings.map(booking => `
      <div class="booking-card">
        <img src="${booking.image_url || 'https://via.placeholder.com/150x100?text=Court'}" 
             alt="${booking.court_name}" 
             class="booking-card-image"
             onerror="this.src='https://via.placeholder.com/150x100?text=Court'">
        
        <div class="booking-card-content">
          <h3>${booking.court_name}</h3>
          <p class="text-muted text-sm">📍 ${booking.court_address}</p>
          <p class="mt-1">
            📅 ${formatDate(booking.booking_date)} • 
            🕐 ${booking.start_time} - ${booking.end_time}
          </p>
          <p class="mt-1">
            💳 ${booking.payment_method || 'Chưa chọn'} • 
            <strong>${formatPrice(booking.total_price)}</strong>
          </p>
        </div>
        
        <div class="booking-card-actions">
          ${getStatusBadge(booking.status)}
          
          ${booking.status === 'pending' || booking.status === 'confirmed'
                ? `<button class="btn btn-danger btn-sm" onclick="openCancelModal(${booking.id})">Hủy đặt</button>`
                : ''
            }
          
          ${booking.status === 'completed' && !booking.has_review
                ? `<a href="/user/review/review.html?booking=${booking.id}" class="btn btn-primary btn-sm">Đánh giá</a>`
                : ''
            }
        </div>
      </div>
    `).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-center text-danger">Có lỗi xảy ra.</p>';
    }
}

function openCancelModal(bookingId) {
    cancelBookingId = bookingId;
    document.getElementById('cancel-reason').value = '';
    showModal('cancel-modal');
}

async function confirmCancel() {
    if (!cancelBookingId) return;

    const btn = document.getElementById('confirm-cancel-btn');
    const reason = document.getElementById('cancel-reason').value.trim();

    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
        await api.put(`/bookings/${cancelBookingId}/cancel`, { reason });

        hideModal('cancel-modal');
        showAlert('Hủy đặt sân thành công!', 'success');
        loadBookings();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận hủy';
        cancelBookingId = null;
    }
}
