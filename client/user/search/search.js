// Search page functionality

document.addEventListener('DOMContentLoaded', () => {
    loadDistricts();
    loadCourts();

    document.getElementById('search-btn').addEventListener('click', loadCourts);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadCourts();
    });
    document.getElementById('district-filter').addEventListener('change', loadCourts);
    document.getElementById('price-filter').addEventListener('change', loadCourts);
});

async function loadDistricts() {
    try {
        const districts = await api.get('/courts/districts');
        const select = document.getElementById('district-filter');

        // Reset lại select để tránh bị double dữ liệu nếu hàm chạy 2 lần
        select.innerHTML = '<option value="">Tất cả quận</option>';

        districts.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Load districts error:', error);
    }
}

async function loadCourts() {
    const container = document.getElementById('courts-list');
    const resultsInfo = document.getElementById('results-info');

    // Hiển thị loading
    if(container) container.innerHTML = '<div class="text-center w-100 mt-5">Đang tải...</div>';

    const search = document.getElementById('search-input').value.trim();
    const district = document.getElementById('district-filter').value;
    const priceRange = document.getElementById('price-filter').value;

    let params = new URLSearchParams();
    if (search) params.append('search', search);
    if (district) params.append('district', district);
    if (priceRange) {
        const [min, max] = priceRange.split('-');
        params.append('min_price', min);
        params.append('max_price', max);
    }

    try {
        const courts = await api.get(`/courts?${params.toString()}`);

        if (resultsInfo) resultsInfo.textContent = `Tìm thấy ${courts.length} sân`;

        if (courts.length === 0) {
            container.innerHTML = `
                <div class="card text-center" style="grid-column: 1 / -1; padding: 2rem;">
                  <p class="text-muted">Không tìm thấy sân nào phù hợp.</p>
                </div>
            `;
            return;
        }

        // --- BẮT ĐẦU ĐOẠN SỬA ---
        container.innerHTML = courts.map(court => {
            // Xử lý đường dẫn ảnh
            // Nếu court.image_url có dữ liệu -> Ghép với localhost:3000
            // Nếu không -> Dùng ảnh placeholder mặc định ngay từ đầu
            const imageUrl = court.image_url 
                ? `http://localhost:3000${court.image_url}` 
                : 'https://via.placeholder.com/400x200?text=San+Pickleball';

            return `
              <div class="court-card">
                <div style="height: 200px; overflow: hidden;">
                    <img src="${imageUrl}" 
                         alt="${court.name}" 
                         class="court-card-image"
                         style="width: 100%; height: 100%; object-fit: cover; display: block;">
                </div>
                
                <div class="court-card-body">
                  <h3 class="court-card-title">${court.name}</h3>
                  <p class="court-card-location">📍 ${court.district_name || 'Hồ Chí Minh'}</p>
                  <p class="text-sm text-muted mb-1">${court.address}</p>
                  <p class="court-card-price" style="color: #2563eb; font-weight: bold;">
                    ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(court.price_per_hour)}/giờ
                  </p>
                </div>
                <div class="court-card-footer">
                  <div>
                    ${court.avg_rating
                        ? `<span style="color: #fbbf24">★</span> ${Math.round(court.avg_rating * 10) / 10} <span class="text-sm text-muted">(${court.review_count})</span>`
                        : '<span class="text-muted text-sm">Chưa có đánh giá</span>'
                    }
                  </div>
                  <a href="/user/booking/booking.html?id=${court.id}" class="btn btn-primary btn-sm">Đặt sân</a>
                </div>
              </div>
            `;
        }).join('');
        // --- KẾT THÚC ĐOẠN SỬA ---

    } catch (error) {
        console.error(error); 
        container.innerHTML = '<p class="text-center text-danger">Có lỗi xảy ra khi tải danh sách sân.</p>';
    }
}