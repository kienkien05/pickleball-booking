// Review page functionality

let currentBookingId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('booking');

    if (bookingId) {
        currentBookingId = bookingId;
        showReviewForm(bookingId);
    } else {
        loadReviewableBookings();
    }

    document.getElementById('review-form').addEventListener('submit', submitReview);
});

async function showReviewForm(bookingId) {
    document.getElementById('review-form-container').classList.remove('hidden');
    document.getElementById('bookings-list').classList.add('hidden');

    try {
        const bookings = await api.get('/reviews/my-bookings');
        const booking = bookings.find(b => b.id == bookingId);

        if (!booking) {
            showAlert('Không tìm thấy đơn đặt sân', 'error');
            window.location.href = '/user/history/history.html';
            return;
        }

        if (booking.has_review) {
            showAlert('Bạn đã đánh giá đơn này rồi', 'warning');
            window.location.href = '/user/history/history.html';
            return;
        }

        document.getElementById('booking-info').innerHTML = `
      <div class="card" style="background: var(--background-alt);">
        <p><strong>${booking.court_name}</strong></p>
        <p class="text-sm text-muted">
          📅 ${formatDate(booking.booking_date)} • 
          🕐 ${booking.start_time} - ${booking.end_time}
        </p>
      </div>
    `;
    } catch (error) {
        showAlert('Có lỗi xảy ra', 'error');
    }
}

async function loadReviewableBookings() {
    const container = document.getElementById('bookings-list');
    showLoading(container);

    try {
        const bookings = await api.get('/reviews/my-bookings');
        const reviewable = bookings.filter(b => !b.has_review);

        if (reviewable.length === 0) {
            container.innerHTML = `
        <div class="card text-center">
          <p class="text-muted">Không có đơn nào cần đánh giá.</p>
          <p class="text-sm text-muted mt-1">Chỉ có thể đánh giá các đơn đã hoàn thành.</p>
          <a href="/user/history/history.html" class="btn btn-secondary mt-2">Xem lịch sử đặt</a>
        </div>
      `;
            return;
        }

        container.innerHTML = `
      <p class="mb-2">Các đơn cần đánh giá:</p>
      ${reviewable.map(booking => `
        <div class="card mb-1">
          <div class="flex-between">
            <div>
              <strong>${booking.court_name}</strong>
              <p class="text-sm text-muted">
                📅 ${formatDate(booking.booking_date)} • 
                🕐 ${booking.start_time} - ${booking.end_time}
              </p>
            </div>
            <a href="/user/review/review.html?booking=${booking.id}" class="btn btn-primary btn-sm">Đánh giá</a>
          </div>
        </div>
      `).join('')}
    `;
    } catch (error) {
        container.innerHTML = '<p class="text-center text-danger">Có lỗi xảy ra.</p>';
    }
}

async function submitReview(e) {
    e.preventDefault();

    const form = e.target;
    const rating = form.querySelector('input[name="rating"]:checked');
    const comment = form.comment.value.trim();
    const btn = document.getElementById('submit-review-btn');

    if (!rating) {
        showAlert('Vui lòng chọn số sao đánh giá', 'warning');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang gửi...';

    try {
        await api.post('/reviews', {
            booking_id: parseInt(currentBookingId),
            rating: parseInt(rating.value),
            comment: comment || null
        });

        showAlert('Đánh giá thành công!', 'success');
        setTimeout(() => {
            window.location.href = '/user/history/history.html';
        }, 1500);
    } catch (error) {
        showAlert(error.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Gửi đánh giá';
    }
}
