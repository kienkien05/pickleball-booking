async function notifyAdmins(db, { title, message, type = 'system', bookingId = null }) {
  const admins = await db.query("SELECT id FROM users WHERE vaiTro = 'Admin'");
  for (const admin of admins.rows) {
    await db.query(
      'INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, $4, $5)',
      [admin.id, title, message, type, bookingId]
    );
  }
}

module.exports = { notifyAdmins };
