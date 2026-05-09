const { pool } = require('./src/config/database');

async function migrateEquipment() {
    try {
        console.log('Bắt đầu cập nhật dữ liệu thiết bị cũ...');
        
        // Lấy ID của sân đầu tiên để gán cho các thiết bị cũ (Global)
        const courtRes = await pool.query('SELECT id FROM courts ORDER BY id LIMIT 1');
        
        if (courtRes.rows.length === 0) {
            console.log('Không tìm thấy sân nào để gán thiết bị.');
            return;
        }
        
        const firstCourtId = courtRes.rows[0].id;
        
        // Cập nhật tất cả thiết bị chưa có court_id
        const result = await pool.query(
            'UPDATE equipment SET court_id = $1 WHERE court_id IS NULL',
            [firstCourtId]
        );
        
        console.log(`Đã cập nhật ${result.rowCount} thiết bị cũ sang sân ID: ${firstCourtId}`);
    } catch (error) {
        console.error('Lỗi khi cập nhật dữ liệu:', error.message);
    } finally {
        process.exit();
    }
}

migrateEquipment();
