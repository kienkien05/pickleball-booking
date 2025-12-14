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

    showLoading(container);

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

        resultsInfo.textContent = `Tìm thấy ${courts.length} sân`;

        if (courts.length === 0) {
            container.innerHTML = `
        <div class="card text-center" style="grid-column: 1 / -1;">
          <p class="text-muted">Không tìm thấy sân nào phù hợp.</p>
        </div>
      `;
            return;
        }

        container.innerHTML = courts.map(court => `
      <div class="court-card">
        <img src="${court.image_url || '/assets/images/court-placeholder.jpg'}" 
             alt="${court.name}" 
             class="court-card-image"
             onerror="this.src='https://via.placeholder.com/400x200?text=Pickleball+Court'">
        <div class="court-card-body">
          <h3 class="court-card-title">${court.name}</h3>
          <p class="court-card-location">📍 ${court.district_name}</p>
          <p class="text-sm text-muted mb-1">${court.address}</p>
          <p class="court-card-price">${formatPrice(court.price_per_hour)}/giờ</p>
        </div>
        <div class="court-card-footer">
          <div>
            ${court.avg_rating
                ? `${getStarsHTML(Math.round(court.avg_rating))} <span class="text-sm text-muted">(${court.review_count})</span>`
                : '<span class="text-muted text-sm">Chưa có đánh giá</span>'
            }
          </div>
          <a href="/user/booking/booking.html?id=${court.id}" class="btn btn-primary btn-sm">Đặt sân</a>
        </div>
      </div>
    `).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-center text-danger">Có lỗi xảy ra khi tải danh sách sân.</p>';
    }
}
