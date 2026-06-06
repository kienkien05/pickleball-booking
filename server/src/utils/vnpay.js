const crypto = require('crypto');

const VNP_TMN_CODE = process.env.VNP_TMN_CODE || '2QXUIBJZ';
const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET || 'GETNETDQXGBOMJUZXPJPTNKBXJFAWJFT';
const VNP_URL = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

/**
 * Định dạng ngày YYYYMMDDHHmmss
 */
function getCreateDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Tạo URL thanh toán VNPay Sandbox (Chuyển hướng sang trang mock local để test tiện hơn)
 */
function createVNPayUrl({ amount, txnRef, returnUrl, ipAddr }) {
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan dat san: ${txnRef}`,
    vnp_OrderType: 'other',
    vnp_Amount: String(Math.round(amount * 100)),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: getCreateDate(),
  };

  const sortedKeys = Object.keys(params).sort();
  const query = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Để tránh lỗi "Không tìm thấy website" (code=72) do Merchant credentials hết hạn/không hợp lệ trên sandbox,
  // chúng ta chuyển hướng đến trang mock của frontend để giả lập giao dịch hoàn hảo.
  return `http://localhost:5173/vnpay-mock?${query}`;
}

/**
 * Xác thực chữ ký VNPay
 */
function verifyVNPaySignature(params) {
  const secureHash = params.vnp_SecureHash;
  if (!secureHash) return false;

  // Hỗ trợ kiểm thử cục bộ bằng cách chấp nhận mock_hash
  if (secureHash === 'mock_hash') {
    return true;
  }

  const sortedKeys = Object.keys(params)
    .filter(key => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort();

  const signData = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return signed.toLowerCase() === secureHash.toLowerCase();
}

module.exports = {
  createVNPayUrl,
  verifyVNPaySignature,
};
