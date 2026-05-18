const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = 'UI Comprehensive Tester';
workbook.created = new Date();

const HEADERS = ['Test ID', 'Feature', 'Category', 'Test Scenario', 'Preconditions', 'Test Steps', 'Expected Result', 'Priority'];
const COL_WIDTHS = [12, 20, 15, 45, 35, 60, 50, 10];
const CATEGORIES = ['Positive', 'Negative', 'Validation', 'Permission', 'Edge Case'];
const PRIORITIES = ['High', 'Medium', 'Low'];

let idCounter = {};

function nextId(prefix) {
  if (!idCounter[prefix]) idCounter[prefix] = 0;
  idCounter[prefix]++;
  return `${prefix}-${String(idCounter[prefix]).padStart(3, '0')}`;
}

function createSheet(name, testCases) {
  const sheet = workbook.addWorksheet(name);
  const headerRow = sheet.addRow(HEADERS);

  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 25;

  COL_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  testCases.forEach((tc) => {
    const row = sheet.addRow([tc.id, tc.feature, tc.category, tc.scenario, tc.preconditions, tc.steps, tc.expected, tc.priority]);
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 80;

    // Color-code by category
    const catColors = {
      'Positive': 'FFE2EFDA',
      'Negative': 'FFFCE4D6',
      'Validation': 'FFD9E2F3',
      'Permission': 'FFFFD966',
      'Edge Case': 'FFE4DFEC',
    };
    const bgColor = catColors[tc.category] || 'FFFFFFFF';
    row.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (col === 1 || col === 3 || col === 8) {
        cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
      }
    });
  });

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: testCases.length + 1, column: 8 },
  };
}

// ============================================================================
// SHEET 1: AUTHENTICATION
// ============================================================================
const authTests = [
  // POSITIVE
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Positive',
    scenario: 'Register a new user with valid data',
    preconditions: 'Email chưa tồn tại trong hệ thống',
    steps: '1. Vào trang Login\n2. Chuyển sang tab Register\n3. Nhập họ tên: "Nguyen Van A"\n4. Nhập email: "newuser@test.com"\n5. Nhập mật khẩu: "test123"\n6. Nhập xác nhận mật khẩu: "test123"\n7. Click nút Register\n8. Kiểm tra console server lấy mã OTP\n9. Nhập mã OTP vào form xác thực\n10. Click Verify',
    expected: 'Tài khoản được tạo thành công. Tự động đăng nhập và chuyển hướng về trang Home. Hiển thị toast "Đăng ký thành công". Mã giảm giá WELCOME20 được tạo.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Positive',
    scenario: 'Login với email và mật khẩu hợp lệ',
    preconditions: 'Tài khoản tồn tại: user1@gmail.com / user123, trạng thái Active',
    steps: '1. Vào trang Login\n2. Nhập email: "user1@gmail.com"\n3. Nhập mật khẩu: "user123"\n4. Click nút Login',
    expected: 'Đăng nhập thành công. Chuyển hướng về Home. Hiển thị tên người dùng trên navbar. Token JWT được lưu trong localStorage.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Positive',
    scenario: 'Admin login và truy cập trang admin',
    preconditions: 'Tài khoản admin: admin@pickleball.com / admin123',
    steps: '1. Vào trang Login\n2. Nhập email: "admin@pickleball.com"\n3. Nhập mật khẩu: "admin123"\n4. Click Login\n5. Click vào menu Admin trên navbar',
    expected: 'Đăng nhập thành công. Có thể truy cập /admin. Hiển thị dashboard admin với các thống kê.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Forgot Password', category: 'Positive',
    scenario: 'Yêu cầu reset mật khẩu với email đã đăng ký',
    preconditions: 'Email user1@gmail.com đã đăng ký trong hệ thống',
    steps: '1. Vào trang Login\n2. Click "Quên mật khẩu"\n3. Nhập email: "user1@gmail.com"\n4. Click "Gửi mã OTP"\n5. Kiểm tra console server lấy mã OTP\n6. Nhập mã OTP\n7. Nhập mật khẩu mới: "newpass123"\n8. Click "Đặt lại mật khẩu"',
    expected: 'Mật khẩu được cập nhật. Có thể đăng nhập với mật khẩu mới.',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Profile', category: 'Positive',
    scenario: 'Cập nhật thông tin profile',
    preconditions: 'Đã đăng nhập với user1@gmail.com',
    steps: '1. Vào trang Profile\n2. Sửa họ tên thành "Nguyen Van B"\n3. Sửa số điện thoại thành "0987654321"\n4. Sửa địa chỉ thành "Hà Nội"\n5. Click Lưu',
    expected: 'Thông tin được cập nhật. Toast "Cập nhật profile thành công". Navbar hiển thị tên mới.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Negative',
    scenario: 'Login với mật khẩu sai',
    preconditions: 'Tài khoản user1@gmail.com tồn tại',
    steps: '1. Vào trang Login\n2. Nhập email: "user1@gmail.com"\n3. Nhập mật khẩu: "wrongpassword"\n4. Click Login',
    expected: 'Hiển thị lỗi "Email hoặc mật khẩu không chính xác". Không chuyển trang. Không tạo token.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Negative',
    scenario: 'Login với email không tồn tại',
    preconditions: 'Email "nonexist@test.com" chưa đăng ký',
    steps: '1. Vào trang Login\n2. Nhập email: "nonexist@test.com"\n3. Nhập mật khẩu: "test123"\n4. Click Login',
    expected: 'Hiển thị lỗi "Email hoặc mật khẩu không chính xác".',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Negative',
    scenario: 'Login với tài khoản đã bị khóa',
    preconditions: 'Admin đã khóa tài khoản user1@gmail.com (trangThai = Locked)',
    steps: '1. Vào trang Login\n2. Nhập email: "user1@gmail.com"\n3. Nhập mật khẩu: "user123"\n4. Click Login',
    expected: 'Hiển thị lỗi tài khoản bị khóa. Không cho phép đăng nhập.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Negative',
    scenario: 'Đăng ký với email đã tồn tại',
    preconditions: 'Email user1@gmail.com đã đăng ký',
    steps: '1. Vào trang Register\n2. Nhập họ tên: "Test"\n3. Nhập email: "user1@gmail.com"\n4. Nhập mật khẩu: "test123"\n5. Nhập xác nhận mật khẩu: "test123"\n6. Click Register',
    expected: 'Hiển thị lỗi email đã tồn tại. Không tạo tài khoản.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Negative',
    scenario: 'Đăng ký với OTP sai',
    preconditions: 'Đã gửi yêu cầu đăng ký và nhận OTP',
    steps: '1. Nhập mã OTP sai: "999999"\n2. Click Verify',
    expected: 'Hiển thị lỗi "Mã OTP không chính xác hoặc đã hết hạn".',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Forgot Password', category: 'Negative',
    scenario: 'Yêu cầu reset mật khẩu với email không tồn tại',
    preconditions: 'Email "noexist@test.com" chưa đăng ký',
    steps: '1. Vào Forgot Password\n2. Nhập email: "noexist@test.com"\n3. Click "Gửi mã OTP"',
    expected: 'Hiển thị lỗi "Email không tồn tại trong hệ thống".',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Validation',
    scenario: 'Đăng ký với mật khẩu và xác nhận mật khẩu không khớp',
    preconditions: 'Không',
    steps: '1. Vào trang Register\n2. Nhập họ tên: "Test User"\n3. Nhập email: "test@test.com"\n4. Nhập mật khẩu: "test123"\n5. Nhập xác nhận mật khẩu: "test456"\n6. Click Register',
    expected: 'Hiển thị lỗi mật khẩu xác nhận không khớp. Form không submit.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Validation',
    scenario: 'Đăng ký với mật khẩu quá ngắn (<6 ký tự)',
    preconditions: 'Không',
    steps: '1. Vào trang Register\n2. Nhập họ tên: "Test"\n3. Nhập email: "test@test.com"\n4. Nhập mật khẩu: "12345"\n5. Click Register',
    expected: 'Hiển thị lỗi validation mật khẩu tối thiểu 6 ký tự. Form không submit.',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Login', category: 'Validation',
    scenario: 'Submit form login với các trường trống',
    preconditions: 'Không',
    steps: '1. Vào trang Login\n2. Không nhập gì\n3. Click Login',
    expected: 'Hiển thị lỗi validation yêu cầu nhập email và mật khẩu. Form không submit.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Validation',
    scenario: 'Đăng ký với email sai định dạng',
    preconditions: 'Không',
    steps: '1. Vào trang Register\n2. Nhập email: "notanemail"\n3. Click Register',
    expected: 'Trình duyệt hiển thị validation error trên trường email (type="email").',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'OTP', category: 'Validation',
    scenario: 'Nhập OTP không đủ 6 chữ số',
    preconditions: 'Đang ở màn hình nhập OTP',
    steps: '1. Chỉ nhập 3 chữ số\n2. Click Verify',
    expected: 'Form không cho submit hoặc hiển thị lỗi OTP phải đủ 6 chữ số.',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Reset Password', category: 'Validation',
    scenario: 'Reset mật khẩu với mật khẩu mới < 6 ký tự',
    preconditions: 'Đã xác thực OTP thành công',
    steps: '1. Nhập mật khẩu mới: "123"\n2. Click "Đặt lại mật khẩu"',
    expected: 'Hiển thị lỗi validation mật khẩu tối thiểu 6 ký tự.',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('AUTH'), feature: 'Auth', category: 'Permission',
    scenario: 'Truy cập trang profile khi chưa đăng nhập',
    preconditions: 'Chưa đăng nhập, không có token',
    steps: '1. Truy cập URL trực tiếp: /profile',
    expected: 'Chuyển hướng về trang Login. Không hiển thị nội dung profile.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Auth', category: 'Permission',
    scenario: 'Truy cập trang admin với tài khoản Customer',
    preconditions: 'Đăng nhập với user1@gmail.com (Customer)',
    steps: '1. Truy cập URL: /admin',
    expected: 'Hiển thị trang Forbidden (403) hoặc chuyển hướng về /forbidden.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Auth', category: 'Permission',
    scenario: 'Token JWT hết hạn - tự động logout',
    preconditions: 'Token đã hết hạn (quá 7 ngày)',
    steps: '1. Đăng nhập với token hết hạn\n2. Thực hiện bất kỳ API call nào',
    expected: 'API trả về 401. Frontend tự động logout và chuyển về trang Login.',
    priority: 'High',
  },
  {
    id: nextId('AUTH'), feature: 'Auth', category: 'Permission',
    scenario: 'Gọi API admin với token của Customer',
    preconditions: 'Đăng nhập với user1@gmail.com (Customer)',
    steps: '1. Gọi API: GET /api/admin/dashboard với token Customer',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('AUTH'), feature: 'OTP', category: 'Edge Case',
    scenario: 'OTP hết hạn sau 10 phút',
    preconditions: 'Đã gửi yêu cầu register và chờ > 10 phút',
    steps: '1. Gửi yêu cầu đăng ký\n2. Chờ 11 phút\n3. Nhập mã OTP đã nhận\n4. Click Verify',
    expected: 'Hiển thị lỗi "Mã OTP đã hết hạn". Yêu cầu gửi lại OTP mới.',
    priority: 'Medium',
  },
  {
    id: nextId('AUTH'), feature: 'Auth', category: 'Edge Case',
    scenario: 'Tài khoản bị khóa trong khi đang đăng nhập (polling phát hiện)',
    preconditions: 'Đang đăng nhập với user1@gmail.com. Admin khóa tài khoản từ trang khác.',
    steps: '1. Đăng nhập với user1@gmail.com\n2. Admin khóa tài khoản từ session khác\n3. Chờ 15 giây cho lần poll tiếp theo',
    expected: 'Frontend tự động logout và chuyển về Login. Hiển thị thông báo tài khoản bị khóa.',
    priority: 'Low',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Edge Case',
    scenario: 'Đăng ký với số điện thoại đã tồn tại',
    preconditions: 'SĐT "0987654321" đã được đăng ký bởi user khác',
    steps: '1. Đăng ký tài khoản mới\n2. Nhập SĐT: "0987654321"\n3. Hoàn tất đăng ký',
    expected: 'Hiển thị lỗi số điện thoại đã được sử dụng.',
    priority: 'Low',
  },
  {
    id: nextId('AUTH'), feature: 'Register', category: 'Edge Case',
    scenario: 'Tên người dùng có ký tự đặc biệt và Unicode',
    preconditions: 'Không',
    steps: '1. Đăng ký với tên: "Nguyễn Văn A-Châu @2024"\n2. Hoàn tất các bước',
    expected: 'Tên được lưu đúng với ký tự Unicode và đặc biệt.',
    priority: 'Low',
  },
];

createSheet('1-Auth', authTests);

// ============================================================================
// SHEET 2: COURTS
// ============================================================================
const courtTests = [
  // POSITIVE
  {
    id: nextId('COURT'), feature: 'Court List', category: 'Positive',
    scenario: 'Xem danh sách sân đang hoạt động',
    preconditions: 'Có ít nhất 1 sân trạng thái "San sang"',
    steps: '1. Vào trang /courts\n2. Quan sát danh sách sân',
    expected: 'Hiển thị tất cả sân có trạng thái "San sang" hoặc "Bao tri". Không hiển thị sân "An". Có phân trang.',
    priority: 'High',
  },
  {
    id: nextId('COURT'), feature: 'Court Detail', category: 'Positive',
    scenario: 'Xem chi tiết sân với hình ảnh và đánh giá',
    preconditions: 'Sân tồn tại với ít nhất 1 ảnh và 1 đánh giá',
    steps: '1. Vào /courts\n2. Click vào 1 sân\n3. Xem trang chi tiết',
    expected: 'Hiển thị ảnh sân (có thể chuyển ảnh), mô tả, đánh giá trung bình, số lượng đánh giá, danh sách khung giờ.',
    priority: 'High',
  },
  {
    id: nextId('COURT'), feature: 'Create Court', category: 'Positive',
    scenario: 'Admin tạo sân mới với dữ liệu hợp lệ',
    preconditions: 'Đăng nhập với tài khoản admin',
    steps: '1. Vào /admin/courts\n2. Click "Thêm sân mới"\n3. Nhập tên sân: "Sân Test 01"\n4. Nhập mô tả: "Sân pickleball mới"\n5. Upload ảnh sân\n6. Click Lưu',
    expected: 'Sân mới được tạo thành công. Toast "Tạo sân thành công". Sân xuất hiện trong danh sách.',
    priority: 'High',
  },
  {
    id: nextId('COURT'), feature: 'Update Court', category: 'Positive',
    scenario: 'Admin cập nhật thông tin sân',
    preconditions: 'Đăng nhập admin, sân tồn tại',
    steps: '1. Vào /admin/courts\n2. Click Edit trên 1 sân\n3. Sửa tên sân thành "Sân Đã Sửa"\n4. Sửa mô tả\n5. Click Lưu',
    expected: 'Thông tin sân được cập nhật. Toast thành công. Danh sách hiển thị tên mới.',
    priority: 'Medium',
  },
  {
    id: nextId('COURT'), feature: 'Delete Court', category: 'Positive',
    scenario: 'Admin xóa mềm sân (soft delete)',
    preconditions: 'Đăng nhập admin, sân tồn tại với trạng thái "San sang"',
    steps: '1. Vào /admin/courts\n2. Click Delete trên 1 sân\n3. Xác nhận xóa',
    expected: 'Sân chuyển trạng thái thành "An" (không xóa khỏi DB). Không hiển thị trong danh sách public.',
    priority: 'Medium',
  },
  {
    id: nextId('COURT'), feature: 'Court Images', category: 'Positive',
    scenario: 'Admin upload nhiều ảnh cho sân',
    preconditions: 'Đăng nhập admin, sân tồn tại',
    steps: '1. Vào edit sân\n2. Click upload ảnh\n3. Chọn 3 ảnh (định dạng jpg/png)\n4. Click Upload',
    expected: '3 ảnh được upload và hiển thị trong gallery sân. Có thể đặt ảnh chính (set main).',
    priority: 'Medium',
  },
  {
    id: nextId('COURT'), feature: 'Court Images', category: 'Positive',
    scenario: 'Admin đặt ảnh chính cho sân',
    preconditions: 'Sân có ít nhất 2 ảnh',
    steps: '1. Vào edit sân\n2. Click "Đặt làm ảnh chính" trên ảnh thứ 2\n3. Xác nhận',
    expected: 'Ảnh được chọn trở thành ảnh chính (isMain = true). Ảnh này hiển thị đầu tiên trong list.',
    priority: 'Low',
  },

  // NEGATIVE
  {
    id: nextId('COURT'), feature: 'Create Court', category: 'Negative',
    scenario: 'Admin tạo sân với tên đã tồn tại',
    preconditions: 'Sân "Sân Test 01" đã tồn tại',
    steps: '1. Vào /admin/courts\n2. Click "Thêm sân mới"\n3. Nhập tên: "Sân Test 01"\n4. Click Lưu',
    expected: 'Hiển thị lỗi tên sân đã tồn tại. Không tạo sân mới.',
    priority: 'Medium',
  },
  {
    id: nextId('COURT'), feature: 'Court Detail', category: 'Negative',
    scenario: 'Xem chi tiết sân không tồn tại',
    preconditions: 'Không',
    steps: '1. Truy cập URL: /courts/99999',
    expected: 'Hiển thị lỗi "Không tìm thấy sân" hoặc trang 404.',
    priority: 'Low',
  },
  {
    id: nextId('COURT'), feature: 'Delete Court', category: 'Negative',
    scenario: 'Xóa sân đang có booking active',
    preconditions: 'Sân có booking với trạng thái "Da thanh toan" trong tương lai',
    steps: '1. Admin vào /admin/courts\n2. Click Delete sân đang có booking\n3. Xác nhận',
    expected: 'Sân vẫn được soft delete (chuyển "An"). Booking hiện tại không bị ảnh hưởng.',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('COURT'), feature: 'Create Court', category: 'Validation',
    scenario: 'Tạo sân với tên trống',
    preconditions: 'Đăng nhập admin',
    steps: '1. Vào form tạo sân\n2. Không nhập tên sân\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation yêu cầu nhập tên sân.',
    priority: 'Medium',
  },
  {
    id: nextId('COURT'), feature: 'Update Court', category: 'Validation',
    scenario: 'Cập nhật sân với tên trống',
    preconditions: 'Đăng nhập admin',
    steps: '1. Edit sân\n2. Xóa tên sân\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation.',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('COURT'), feature: 'Create Court', category: 'Permission',
    scenario: 'Customer thử tạo sân qua API',
    preconditions: 'Đăng nhập với tài khoản Customer',
    steps: '1. Gọi API: POST /api/courts với dữ liệu sân',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('COURT'), feature: 'Delete Court', category: 'Permission',
    scenario: 'Customer thử xóa sân',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: DELETE /api/courts/1',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('COURT'), feature: 'Court List', category: 'Permission',
    scenario: 'Customer không thấy sân bị ẩn',
    preconditions: 'Có sân trạng thái "An" trong DB',
    steps: '1. Đăng nhập Customer\n2. Vào /courts\n3. Tìm sân bị ẩn',
    expected: 'Sân "An" không hiển thị trong danh sách.',
    priority: 'Medium',
  },

  // EDGE CASES
  {
    id: nextId('COURT'), feature: 'Court List', category: 'Edge Case',
    scenario: 'Danh sách sân rỗng',
    preconditions: 'Không có sân nào trạng thái "San sang" hoặc "Bao tri"',
    steps: '1. Vào /courts',
    expected: 'Hiển thị thông báo "Không có sân nào" hoặc empty state.',
    priority: 'Low',
  },
  {
    id: nextId('COURT'), feature: 'Court Images', category: 'Edge Case',
    scenario: 'Upload ảnh vượt quá giới hạn 10 ảnh',
    preconditions: 'Sân đã có 8 ảnh',
    steps: '1. Thử upload 5 ảnh mới cùng lúc',
    expected: 'Chỉ upload tối đa 2 ảnh còn thiếu. Hoặc hiển thị lỗi vượt giới hạn.',
    priority: 'Low',
  },
  {
    id: nextId('COURT'), feature: 'Court Search', category: 'Edge Case',
    scenario: 'Tìm kiếm sân với từ khóa Unicode',
    preconditions: 'Có sân tên tiếng Việt',
    steps: '1. Vào /courts\n2. Nhập từ khóa: "sân"\n3. Enter',
    expected: 'Hiển thị sân có tên chứa từ khóa (hỗ trợ Unicode).',
    priority: 'Low',
  },
];

createSheet('2-Courts', courtTests);

// ============================================================================
// SHEET 3: TIME SLOTS
// ============================================================================
const timeSlotTests = [
  // POSITIVE
  {
    id: nextId('TS'), feature: 'View Time Slots', category: 'Positive',
    scenario: 'Xem danh sách khung giờ của sân cho ngày cụ thể',
    preconditions: 'Sân có ít nhất 3 khung giờ',
    steps: '1. Vào /courts/1\n2. Chọn ngày hôm nay\n3. Quan sát danh sách khung giờ',
    expected: 'Hiển thị tất cả khung giờ của sân với giá, trạng thái (còn trống/đã đặt/khóa). Khung giờ quá khứ hiển thị "Đã khóa".',
    priority: 'High',
  },
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Positive',
    scenario: 'Admin tạo khung giờ mới cho sân',
    preconditions: 'Đăng nhập admin, sân tồn tại',
    steps: '1. Vào /admin/timeslots\n2. Chọn sân\n3. Click "Thêm khung giờ"\n4. Nhập giờ bắt đầu: 18:00\n5. Nhập giờ kết thúc: 19:00\n6. Nhập giá: 200000\n7. Click Lưu',
    expected: 'Khung giờ mới được tạo. Hiển thị trong danh sách. Xuất hiện khi xem sân.',
    priority: 'High',
  },
  {
    id: nextId('TS'), feature: 'Update Time Slot', category: 'Positive',
    scenario: 'Admin cập nhật giá khung giờ',
    preconditions: 'Đăng nhập admin, khung giờ tồn tại',
    steps: '1. Vào /admin/timeslots\n2. Click Edit khung giờ\n3. Sửa giá thành 250000\n4. Click Lưu',
    expected: 'Giá khung giờ được cập nhật. Hiển thị giá mới khi xem sân.',
    priority: 'Medium',
  },
  {
    id: nextId('TS'), feature: 'Delete Time Slot', category: 'Positive',
    scenario: 'Admin xóa khung giờ chưa có booking',
    preconditions: 'Khung giờ chưa có booking nào',
    steps: '1. Vào /admin/timeslots\n2. Click Delete khung giờ\n3. Xác nhận',
    expected: 'Khung giờ bị xóa. Không còn hiển thị trong danh sách.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Negative',
    scenario: 'Admin tạo khung giờ trùng thời gian với khung giờ hiện có',
    preconditions: 'Sân có khung giờ 08:00-09:00',
    steps: '1. Thêm khung giờ mới: 08:30-09:30\n2. Click Lưu',
    expected: 'Hiển thị lỗi "Khung giờ bị trùng với khung giờ hiện có".',
    priority: 'Medium',
  },
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Negative',
    scenario: 'Admin tạo khung giờ với giờ kết thúc trước giờ bắt đầu',
    preconditions: 'Đăng nhập admin',
    steps: '1. Nhập giờ bắt đầu: 18:00\n2. Nhập giờ kết thúc: 17:00\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation. Giờ kết thúc phải sau giờ bắt đầu.',
    priority: 'Medium',
  },
  {
    id: nextId('TS'), feature: 'Delete Time Slot', category: 'Negative',
    scenario: 'Admin xóa khung giờ đã có booking',
    preconditions: 'Khung giờ có ít nhất 1 booking',
    steps: '1. Vào /admin/timeslots\n2. Click Delete khung giờ đã có booking\n3. Xác nhận',
    expected: 'Khung giờ bị xóa (ON DELETE CASCADE - các booking liên quan cũng bị xóa).',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Validation',
    scenario: 'Tạo khung giờ với giá âm',
    preconditions: 'Đăng nhập admin',
    steps: '1. Nhập giá: -50000\n2. Click Lưu',
    expected: 'Hiển thị lỗi validation. Giá phải là số dương.',
    priority: 'Medium',
  },
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Validation',
    scenario: 'Tạo khung giờ với giá bằng 0',
    preconditions: 'Đăng nhập admin',
    steps: '1. Nhập giá: 0\n2. Click Lưu',
    expected: 'Hệ thống cho phép hoặc từ chối tùy validation rule (kiểm tra thực tế).',
    priority: 'Low',
  },
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Validation',
    scenario: 'Tạo khung giờ không chọn sân',
    preconditions: 'Đăng nhập admin',
    steps: '1. Không chọn sân\n2. Nhập các trường khác\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation yêu cầu chọn sân.',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('TS'), feature: 'Create Time Slot', category: 'Permission',
    scenario: 'Customer thử tạo khung giờ',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: POST /api/courts/1/timeslots',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('TS'), feature: 'View All Time Slots', category: 'Permission',
    scenario: 'Customer thử xem tất cả khung giờ (kể cả inactive)',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: GET /api/courts/1/timeslots/all',
    expected: 'API trả về 403 Forbidden. Chỉ admin mới xem được all timeslots.',
    priority: 'Medium',
  },

  // EDGE CASES
  {
    id: nextId('TS'), feature: 'View Time Slots', category: 'Edge Case',
    scenario: 'Khung giờ bị khóa sau BOOKING_LOCK_THRESHOLD (15 phút)',
    preconditions: 'Hiện tại là 14:05',
    steps: '1. Xem sân có khung giờ 14:00-15:00\n2. Quan sát trạng thái slot này',
    expected: 'Khung giờ 14:00-15:00 hiển thị "Đã khóa" (locked) vì đã quá 15 phút từ giờ bắt đầu.',
    priority: 'Medium',
  },
  {
    id: nextId('TS'), feature: 'View Time Slots', category: 'Edge Case',
    scenario: 'Ngày đã qua - tất cả slot bị khóa',
    preconditions: 'Không',
    steps: '1. Chọn ngày hôm qua để xem timeslots',
    expected: 'Tất cả khung giờ đều hiển thị trạng thái "Đã đặt" hoặc không khả dụng.',
    priority: 'Low',
  },
  {
    id: nextId('TS'), feature: 'View Time Slots', category: 'Edge Case',
    scenario: 'Slot vừa được đặt bởi người khác trong lúc user đang xem',
    preconditions: '2 user cùng xem 1 slot',
    steps: '1. User A xem slot trống\n2. User B đặt slot đó\n3. User A refresh hoặc thử đặt',
    expected: 'Slot hiển thị trạng thái "Đã đặt". User A không thể đặt slot đã bị chiếm.',
    priority: 'Medium',
  },
];

createSheet('3-TimeSlots', timeSlotTests);

// ============================================================================
// SHEET 4: BOOKINGS
// ============================================================================
const bookingTests = [
  // POSITIVE
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Positive',
    scenario: 'Đặt sân thành công với đầy đủ thông tin',
    preconditions: 'Đăng nhập Customer, sân "San sang", slot trống ngày mai',
    steps: '1. Vào /courts/1\n2. Chọn ngày mai\n3. Chọn 1 khung giờ trống\n4. (Optional) Chọn dịch vụ đi kèm\n5. Chọn phương thức thanh toán: "Tiền mặt"\n6. Click "Đặt sân"',
    expected: 'Booking được tạo. Toast thành công. Chuyển đến trang booking detail. Payment record được tạo. Notification được gửi.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Positive',
    scenario: 'Đặt sân với mã giảm giá hợp lệ',
    preconditions: 'User có mã giảm giá khả dụng',
    steps: '1. Chọn sân + slot\n2. Nhập mã giảm giá: "WELCOME8"\n3. Click "Áp dụng"\n4. Kiểm tra giá sau giảm\n5. Click "Đặt sân"',
    expected: 'Mã giảm giá được áp dụng. Tổng tiền giảm đúng %. Payment record ghi nhận đúng số tiền.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Positive',
    scenario: 'Đặt sân kèm dịch vụ',
    preconditions: 'Có dịch vụ khả dụng (soLuongTon > 0)',
    steps: '1. Chọn sân + slot\n2. Thêm 2 vợt (dịch vụ)\n3. Thêm 2 chai nước\n4. Click "Đặt sân"',
    expected: 'Booking được tạo với services. booking_services records được tạo. Tổng tiền = tiền sân + tiền dịch vụ.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Cancel Booking', category: 'Positive',
    scenario: 'Hủy booking trước 3 giờ',
    preconditions: 'Booking trạng thái "Da thanh toan", ngày chơi là ngày mai, thời gian hiện tại cách giờ chơi > 3h',
    steps: '1. Vào /my-bookings\n2. Tìm booking cần hủy\n3. Click "Hủy đặt sân"\n4. Xác nhận hủy',
    expected: 'Booking chuyển trạng thái "Da huy". Hiển thị toast thành công. Notification được gửi.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Check-in', category: 'Positive',
    scenario: 'Admin check-in cho khách',
    preconditions: 'Đăng nhập Admin, booking trạng thái "Da thanh toan" đúng ngày',
    steps: '1. Vào /admin/bookings\n2. Tìm booking\n3. Click "Check-in"',
    expected: 'Booking chuyển trạng thái "Dang su dung". Toast thành công.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Check-out', category: 'Positive',
    scenario: 'Admin check-out sau khi hết giờ chơi',
    preconditions: 'Booking trạng thái "Dang su dung"',
    steps: '1. Vào /admin/bookings\n2. Tìm booking\n3. Click "Check-out"',
    expected: 'Booking chuyển trạng thái "Hoan thanh". Toast thành công.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'QR Code', category: 'Positive',
    scenario: 'Xem QR code của booking',
    preconditions: 'Booking tồn tại',
    steps: '1. Vào /my-bookings\n2. Click "QR Code" hoặc vào booking detail\n3. Quan sát QR code',
    expected: 'QR code được hiển thị. Có thể scan để check-in.',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'My Bookings', category: 'Positive',
    scenario: 'Xem danh sách booking của bản thân',
    preconditions: 'Đăng nhập, có ít nhất 2 booking',
    steps: '1. Vào /my-bookings\n2. Xem danh sách\n3. Lọc theo trạng thái "Đã thanh toán"',
    expected: 'Hiển thị danh sách booking. Phân trang hoạt động. Lọc theo trạng thái hoạt động đúng.',
    priority: 'High',
  },

  // NEGATIVE
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Negative',
    scenario: 'Đặt sân đã có người đặt (conflict)',
    preconditions: 'Slot A ngày mai đã có booking "Da thanh toan"',
    steps: '1. Chọn sân + ngày mai + Slot A\n2. Click "Đặt sân"',
    expected: 'API trả về 409 Conflict. Hiển thị lỗi "Khung giờ này đã có người đặt".',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Negative',
    scenario: 'Đặt sân trong quá khứ',
    preconditions: 'Không',
    steps: '1. Chọn sân \n2. Chọn ngày hôm qua\n3. Chọn slot\n4. Click "Đặt sân"',
    expected: 'Không cho phép đặt ngày quá khứ. API trả về lỗi. Hoặc frontend chặn chọn ngày quá khứ.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Negative',
    scenario: 'Đặt sân đang bảo trì',
    preconditions: 'Sân có trạng thái "Bao tri"',
    steps: '1. Chọn sân đang bảo trì\n2. Click "Đặt sân"',
    expected: 'Không cho phép đặt. Hiển thị lỗi "Sân đang bảo trì".',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'Cancel Booking', category: 'Negative',
    scenario: 'Hủy booking trong vòng 3 giờ trước giờ chơi',
    preconditions: 'Booking ngày mai 08:00, hiện tại là 05:30 cùng ngày',
    steps: '1. Vào /my-bookings\n2. Tìm booking 08:00 ngày mai\n3. Click "Hủy"',
    expected: 'Hiển thị lỗi "Chỉ được hủy trước 3 giờ". Không cho phép hủy.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Cancel Booking', category: 'Negative',
    scenario: 'Hủy booking đã hoàn thành',
    preconditions: 'Booking trạng thái "Hoan thanh"',
    steps: '1. Tìm booking đã hoàn thành\n2. Click "Hủy" (nếu có)',
    expected: 'Không hiển thị nút hủy. Hoặc API từ chối với lỗi trạng thái không hợp lệ.',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'Check-in', category: 'Negative',
    scenario: 'Check-in booking đã hủy',
    preconditions: 'Booking trạng thái "Da huy"',
    steps: '1. Admin gọi API check-in cho booking đã hủy',
    expected: 'API trả về lỗi "Không thể check-in booking đã hủy".',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Validation',
    scenario: 'Đặt sân không chọn khung giờ',
    preconditions: 'Đăng nhập',
    steps: '1. Vào court detail\n2. Chọn ngày\n3. Không chọn khung giờ nào\n4. Click "Đặt sân"',
    expected: 'Hiển thị lỗi "Vui lòng chọn ít nhất 1 khung giờ".',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Validation',
    scenario: 'Đặt sân không chọn ngày',
    preconditions: 'Đăng nhập',
    steps: '1. Vào court detail\n2. Chọn khung giờ (không chọn ngày)\n3. Click "Đặt sân"',
    expected: 'Hiển thị lỗi yêu cầu chọn ngày.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Validation',
    scenario: 'Đặt sân với mã giảm giá không hợp lệ',
    preconditions: 'Đăng nhập, mã "INVALID" không tồn tại',
    steps: '1. Nhập mã giảm giá: "INVALID"\n2. Click "Áp dụng"',
    expected: 'API validate trả về lỗi. Hiển thị "Mã giảm giá không hợp lệ".',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Validation',
    scenario: 'Đặt sân với số lượng dịch vụ > tồn kho',
    preconditions: 'Dịch vụ "Vợt" chỉ còn 1 trong kho',
    steps: '1. Chọn dịch vụ vợt\n2. Tăng số lượng lên 5\n3. Click "Đặt sân"',
    expected: 'Hiển thị lỗi "Số lượng dịch vụ vượt quá tồn kho".',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Permission',
    scenario: 'Đặt sân khi chưa đăng nhập',
    preconditions: 'Chưa đăng nhập',
    steps: '1. Vào /courts/1\n2. Chọn slot\n3. Click "Đặt sân"',
    expected: 'Yêu cầu đăng nhập. Chuyển hướng về Login.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Check-in', category: 'Permission',
    scenario: 'Customer thử check-in qua API',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: POST /api/bookings/1/checkin',
    expected: 'API trả về 403. Chỉ admin mới được check-in.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'View All Bookings', category: 'Permission',
    scenario: 'Customer thử xem tất cả booking',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: GET /api/bookings (không có tham số)',
    expected: 'API trả về lỗi 403 hoặc chỉ trả về booking của chính user đó.',
    priority: 'High',
  },
  {
    id: nextId('BK'), feature: 'Cancel Booking', category: 'Permission',
    scenario: 'User A thử hủy booking của User B',
    preconditions: 'Đăng nhập User A, booking thuộc về User B',
    steps: '1. Gọi API: POST /api/bookings/{booking_of_B}/cancel',
    expected: 'API từ chối. Kiểm tra booking thuộc về user hiện tại.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'Đặt sân đúng thời điểm threshold (15 phút trước giờ bắt đầu)',
    preconditions: 'Hiện tại 13:45, slot bắt đầu lúc 14:00',
    steps: '1. Vào court detail\n2. Chọn slot 14:00-15:00\n3. Click "Đặt sân"',
    expected: 'Có thể slot đã bị khóa (tùy thời điểm chính xác < hay >= 15 phút). Kiểm tra logic BOOKING_LOCK_THRESHOLD_MINS.',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'Đặt sân với mã giảm giá đã hết số lượng',
    preconditions: 'Mã giảm giá có soLuongDaDung >= soLuongBanDau',
    steps: '1. Nhập mã giảm giá đã hết\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá đã hết số lượng".',
    priority: 'Low',
  },
  {
    id: nextId('BK'), feature: 'No-Show', category: 'Edge Case',
    scenario: 'Booking bị auto cancel do no-show (15 phút sau giờ bắt đầu)',
    preconditions: 'Booking trạng thái "Da thanh toan", giờ bắt đầu 14:00',
    steps: '1. Đợi đến 14:16 (qua 15 phút)\n2. Scheduler chạy (mỗi phút)\n3. Kiểm tra trạng thái booking',
    expected: 'Booking tự động chuyển trạng thái "Da huy" với ghi chú "No-show". Notification được tạo.',
    priority: 'Medium',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'Đặt sân với mã giảm giá đã hết hạn',
    preconditions: 'Mã giảm giá có ngayKetThuc đã qua',
    steps: '1. Nhập mã giảm giá hết hạn\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá đã hết hạn".',
    priority: 'Low',
  },
  {
    id: nextId('BK'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'API booking bị race condition - 2 user cùng đặt 1 slot',
    preconditions: 'Slot còn trống, 2 user cùng submit tại thời điểm gần như đồng thời',
    steps: '1. User A và User B cùng chọn 1 slot\n2. Cả 2 cùng click "Đặt sân"',
    expected: 'Chỉ 1 user đặt thành công. User còn lại nhận lỗi 409 Conflict.',
    priority: 'Medium',
  },
];

createSheet('4-Bookings', bookingTests);

// ============================================================================
// SHEET 5: REVIEWS
// ============================================================================
const reviewTests = [
  // POSITIVE
  {
    id: nextId('REV'), feature: 'Create Review (Booking)', category: 'Positive',
    scenario: 'Đánh giá sân sau khi hoàn thành booking',
    preconditions: 'Có booking "Hoan thanh" của user, chưa review',
    steps: '1. Vào /my-bookings\n2. Tìm booking đã hoàn thành\n3. Click "Đánh giá"\n4. Chọn 5 sao\n5. Nhập bình luận: "Sân đẹp, dịch vụ tốt"\n6. Click Gửi',
    expected: 'Review được tạo thành công. Hiển thị trong danh sách đánh giá của sân.',
    priority: 'High',
  },
  {
    id: nextId('REV'), feature: 'Create Review (Court)', category: 'Positive',
    scenario: 'Đánh giá sân trực tiếp (không qua booking)',
    preconditions: 'Đăng nhập, chưa review sân này trong 24h',
    steps: '1. Vào /courts/1\n2. Kéo xuống phần đánh giá\n3. Chọn 4 sao\n4. Nhập bình luận\n5. Click Gửi',
    expected: 'Review được tạo. Hiển thị trong danh sách. Điểm trung bình của sân cập nhật.',
    priority: 'Medium',
  },
  {
    id: nextId('REV'), feature: 'View Reviews', category: 'Positive',
    scenario: 'Xem danh sách đánh giá của sân',
    preconditions: 'Sân có ít nhất 2 reviews',
    steps: '1. Vào /courts/1\n2. Kéo xuống phần đánh giá\n3. Xem danh sách',
    expected: 'Hiển thị reviews với tên user, sao, bình luận, ngày tạo. Có phân trang. Hiển thị điểm trung bình.',
    priority: 'High',
  },

  // NEGATIVE
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Negative',
    scenario: 'Review booking chưa hoàn thành',
    preconditions: 'Booking trạng thái "Da thanh toan" (chưa check-in/out)',
    steps: '1. Thử review booking chưa hoàn thành',
    expected: 'Không hiển thị nút đánh giá cho booking chưa hoàn thành. API từ chối.',
    priority: 'Medium',
  },
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Negative',
    scenario: 'Review 2 lần cho cùng 1 booking',
    preconditions: 'Đã review booking X',
    steps: '1. Thử review lại booking X',
    expected: 'Hiển thị lỗi "Bạn đã đánh giá booking này rồi".',
    priority: 'Medium',
  },
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Negative',
    scenario: 'Review sân khi chưa đăng nhập',
    preconditions: 'Chưa đăng nhập',
    steps: '1. Vào /courts/1\n2. Thử gửi đánh giá',
    expected: 'Yêu cầu đăng nhập trước khi đánh giá.',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Validation',
    scenario: 'Gửi review không chọn sao',
    preconditions: 'Đăng nhập, có booking hoàn thành',
    steps: '1. Không chọn sao\n2. Nhập bình luận\n3. Click Gửi',
    expected: 'Hiển thị lỗi "Vui lòng chọn số sao đánh giá".',
    priority: 'High',
  },
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Validation',
    scenario: 'Gửi review với bình luận quá dài',
    preconditions: 'Đăng nhập',
    steps: '1. Nhập bình luận 5000+ ký tự\n2. Click Gửi',
    expected: 'Kiểm tra xem có giới hạn độ dài không. Nếu có, hiển thị lỗi.',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Permission',
    scenario: 'User A thử review booking của User B',
    preconditions: 'Booking X thuộc User B, User A đăng nhập',
    steps: '1. User A gọi API review với donDatId của User B',
    expected: 'API kiểm tra và từ chối. Chỉ chủ booking mới review được.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('REV'), feature: 'Create Review (Court)', category: 'Edge Case',
    scenario: 'Review sân 2 lần trong 24 giờ (court-level)',
    preconditions: 'User vừa review sân X (court-level) cách đây 1 giờ',
    steps: '1. Vào /courts/X\n2. Thử review lại sân đó (court-level)',
    expected: 'API từ chối với lỗi "Bạn chỉ có thể đánh giá sân này một lần mỗi 24 giờ".',
    priority: 'Medium',
  },
  {
    id: nextId('REV'), feature: 'View Reviews', category: 'Edge Case',
    scenario: 'Sân chưa có đánh giá nào',
    preconditions: 'Sân mới tạo chưa có review',
    steps: '1. Vào /courts/new-court\n2. Kéo xuống phần đánh giá',
    expected: 'Hiển thị "Chưa có đánh giá nào" hoặc empty state. Hiển thị 0 sao.',
    priority: 'Low',
  },
  {
    id: nextId('REV'), feature: 'Create Review', category: 'Edge Case',
    scenario: 'Review với bình luận chứa ký tự đặc biệt/emoji',
    preconditions: 'Đăng nhập, có booking hoàn thành',
    steps: '1. Nhập bình luận: "Sân 🏸 rất tốt! 👍 <script>alert(1)</script>"\n2. Click Gửi',
    expected: 'Bình luận được lưu. Ký tự đặc biệt và emoji hiển thị đúng. Không bị XSS (nếu frontend escape đúng).',
    priority: 'Low',
  },
];

createSheet('5-Reviews', reviewTests);

// ============================================================================
// SHEET 6: DISCOUNTS
// ============================================================================
const discountTests = [
  // POSITIVE
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Positive',
    scenario: 'Admin tạo mã giảm giá phần trăm',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/discounts\n2. Click "Thêm mã giảm giá"\n3. Nhập code: "SUMMER20"\n4. Chọn loại: "percentage"\n5. Nhập mức giảm: 20\n6. Nhập số lượng: 100\n7. Chọn ngày bắt đầu: hôm nay\n8. Chọn ngày kết thúc: 30 ngày sau\n9. Click Lưu',
    expected: 'Mã giảm giá được tạo. Hiển thị trong danh sách. User có thể thấy và sử dụng.',
    priority: 'High',
  },
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Positive',
    scenario: 'Admin tạo mã giảm giá cố định',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Tạo mã giảm giá\n2. Chọn loại: "fixed"\n3. Nhập mức giảm: 50000\n4. Click Lưu',
    expected: 'Mã giảm giá cố định 50,000 VND được tạo.',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Positive',
    scenario: 'Validate mã giảm giá hợp lệ',
    preconditions: 'Mã "WELCOME8" còn hiệu lực, còn số lượng',
    steps: '1. Vào /courts/1\n2. Chọn slot\n3. Nhập mã: "WELCOME8"\n4. Click "Áp dụng"',
    expected: 'Hiển thị thông tin giảm giá. Tổng tiền giảm 8%.',
    priority: 'High',
  },
  {
    id: nextId('DISC'), feature: 'My Discounts', category: 'Positive',
    scenario: 'Xem danh sách mã giảm giá khả dụng',
    preconditions: 'Đăng nhập, có ít nhất 1 mã giảm giá khả dụng',
    steps: '1. Vào /my-vouchers\n2. Xem danh sách',
    expected: 'Hiển thị tất cả mã giảm giá khả dụng cho user (theo điều kiện audience: all + new_user nếu là user mới + vip nếu là VIP).',
    priority: 'High',
  },
  {
    id: nextId('DISC'), feature: 'Update Discount', category: 'Positive',
    scenario: 'Admin cập nhật mã giảm giá',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/discounts\n2. Edit mã giảm giá\n3. Sửa mức giảm từ 8% thành 15%\n4. Click Lưu',
    expected: 'Mã giảm giá được cập nhật. Hiển thị mức giảm mới.',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Delete Discount', category: 'Positive',
    scenario: 'Admin xóa mã giảm giá',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/discounts\n2. Click Delete mã giảm giá\n3. Xác nhận',
    expected: 'Mã giảm giá bị xóa. Không còn hiển thị trong danh sách.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá hết hạn',
    preconditions: 'Mã giảm giá có ngayKetThuc đã qua',
    steps: '1. Nhập mã giảm giá hết hạn\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá đã hết hạn".',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá đã hết số lượng',
    preconditions: 'soLuongDaDung >= soLuongBanDau',
    steps: '1. Nhập mã giảm giá đã hết\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá đã hết".',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá vượt quá usage_limit_per_user',
    preconditions: 'User đã dùng mã này đúng usage_limit_per_user lần',
    steps: '1. Nhập mã giảm giá\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Bạn đã vượt quá số lần sử dụng mã này".',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá VIP khi là user thường',
    preconditions: 'Mã giảm giá có target_audience = "vip", user không phải VIP',
    steps: '1. User thường nhập mã VIP\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá chỉ dành cho khách hàng VIP".',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá cho sân không được áp dụng',
    preconditions: 'Mã giảm giá có applicable_court_ids = [1,2], đang đặt sân 3',
    steps: '1. Chọn sân 3\n2. Nhập mã giảm giá\n3. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá không áp dụng cho sân này".',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Negative',
    scenario: 'Sử dụng mã giảm giá khi tổng tiền < min_order_value',
    preconditions: 'Mã giảm giá có min_order_value = 500000, tổng tiền đặt sân = 200000',
    steps: '1. Đặt sân giá 200,000\n2. Nhập mã giảm giá\n3. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Đơn hàng tối thiểu 500,000 VND để sử dụng mã này".',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Validation',
    scenario: 'Tạo mã giảm giá với code trùng',
    preconditions: 'Mã "SUMMER20" đã tồn tại',
    steps: '1. Tạo mã giảm giá mới\n2. Nhập code: "SUMMER20"\n3. Click Lưu',
    expected: 'Hiển thị lỗi "Mã giảm giá đã tồn tại".',
    priority: 'High',
  },
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Validation',
    scenario: 'Tạo mã giảm giá với mức giảm âm',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Nhập mức giảm: -10\n2. Click Lưu',
    expected: 'Hiển thị lỗi validation. Mức giảm phải là số dương.',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Validation',
    scenario: 'Tạo mã giảm giá không nhập code',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Không nhập code\n2. Nhập các trường khác\n3. Click Lưu',
    expected: 'Hiển thị lỗi yêu cầu nhập mã code.',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Validation',
    scenario: 'Tạo mã giảm giá phần trăm > 100%',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Chọn loại percentage\n2. Nhập mức giảm: 150\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation. Mức giảm phần trăm không thể vượt quá 100%.',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('DISC'), feature: 'Create Discount', category: 'Permission',
    scenario: 'Customer thử tạo mã giảm giá',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: POST /api/discounts',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('DISC'), feature: 'Delete Discount', category: 'Permission',
    scenario: 'Customer thử xóa mã giảm giá',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: DELETE /api/discounts/1',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Edge Case',
    scenario: 'Hidden discount - chỉ hiển thị khi biết code',
    preconditions: 'Mã giảm giá is_hidden = true (fanpage code)',
    steps: '1. Vào /my-vouchers\n2. Kiểm tra xem có hiển thị không\n3. Dùng trực tiếp code khi đặt sân',
    expected: 'Hidden code không hiển thị trong danh sách vouchers nhưng vẫn dùng được khi nhập trực tiếp.',
    priority: 'Low',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Edge Case',
    scenario: 'Giảm giá cố định lớn hơn tổng tiền',
    preconditions: 'Mã giảm giá fixed 200,000 VND, tổng tiền sân = 150,000 VND',
    steps: '1. Nhập mã giảm giá\n2. Click "Áp dụng"',
    expected: 'Giảm tối đa bằng tổng tiền (150,000 VND). Không âm tiền. Tổng thanh toán = 0.',
    priority: 'Medium',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Edge Case',
    scenario: 'Giảm giá phần trăm với giamToiDa',
    preconditions: 'Mã giảm 50%, giamToiDa = 100,000 VND, tổng tiền = 300,000 VND',
    steps: '1. Nhập mã giảm giá\n2. Click "Áp dụng"',
    expected: 'Giảm tối đa 100,000 VND (không phải 150,000 VND). Tổng thanh toán = 200,000 VND.',
    priority: 'Low',
  },
  {
    id: nextId('DISC'), feature: 'Validate Discount', category: 'Edge Case',
    scenario: 'new_user discount - user đã có booking hoàn thành',
    preconditions: 'Mã giảm giá target_audience = "new_user", user đã có 1 booking hoàn thành',
    steps: '1. Nhập mã giảm giá\n2. Click "Áp dụng"',
    expected: 'Hiển thị lỗi "Mã giảm giá chỉ dành cho khách hàng mới".',
    priority: 'Medium',
  },
];

createSheet('6-Discounts', discountTests);

// ============================================================================
// SHEET 7: SERVICES
// ============================================================================
const serviceTests = [
  // POSITIVE
  {
    id: nextId('SVC'), feature: 'List Services', category: 'Positive',
    scenario: 'Xem danh sách dịch vụ',
    preconditions: 'Có ít nhất 1 dịch vụ',
    steps: '1. Đăng nhập\n2. Vào /admin/services',
    expected: 'Hiển thị tất cả dịch vụ với tên, loại, giá, tồn kho, trạng thái.',
    priority: 'High',
  },
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Positive',
    scenario: 'Admin tạo dịch vụ mới',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/services\n2. Click "Thêm dịch vụ"\n3. Nhập tên: "Khăn lạnh"\n4. Chọn loại: "Dụng cụ"\n5. Nhập giá: 20000\n6. Nhập tồn kho: 50\n7. Click Lưu',
    expected: 'Dịch vụ mới được tạo. Hiển thị trong danh sách. Có thể chọn khi đặt sân.',
    priority: 'High',
  },
  {
    id: nextId('SVC'), feature: 'Update Service', category: 'Positive',
    scenario: 'Admin cập nhật giá dịch vụ',
    preconditions: 'Dịch vụ tồn tại',
    steps: '1. Edit dịch vụ\n2. Sửa giá thành 25000\n3. Click Lưu',
    expected: 'Giá dịch vụ được cập nhật.',
    priority: 'Medium',
  },
  {
    id: nextId('SVC'), feature: 'Delete Service', category: 'Positive',
    scenario: 'Admin xóa dịch vụ chưa được sử dụng',
    preconditions: 'Dịch vụ chưa có booking_services nào liên kết',
    steps: '1. Click Delete dịch vụ\n2. Xác nhận',
    expected: 'Dịch vụ bị xóa. Không còn hiển thị.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Negative',
    scenario: 'Tạo dịch vụ với giá âm',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Nhập giá: -10000\n2. Click Lưu',
    expected: 'Hiển thị lỗi validation.',
    priority: 'Medium',
  },
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Negative',
    scenario: 'Tạo dịch vụ với tồn kho âm',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Nhập tồn kho: -5\n2. Click Lưu',
    expected: 'Hiển thị lỗi validation.',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Validation',
    scenario: 'Tạo dịch vụ không nhập tên',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Không nhập tên\n2. Click Lưu',
    expected: 'Hiển thị lỗi yêu cầu nhập tên dịch vụ.',
    priority: 'Medium',
  },
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Validation',
    scenario: 'Tạo dịch vụ không nhập giá',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Nhập tên nhưng không nhập giá\n2. Click Lưu',
    expected: 'Hiển thị lỗi yêu cầu nhập giá.',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('SVC'), feature: 'Create Service', category: 'Permission',
    scenario: 'Customer thử tạo dịch vụ',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: POST /api/services',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('SVC'), feature: 'Delete Service', category: 'Permission',
    scenario: 'Customer thử xóa dịch vụ',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: DELETE /api/services/1',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('SVC'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'Đặt dịch vụ hết hàng (tồn kho = 0)',
    preconditions: 'Dịch vụ có soLuongTon = 0',
    steps: '1. Vào đặt sân\n2. Thử thêm dịch vụ hết hàng',
    expected: 'Không cho phép chọn dịch vụ hết hàng. Hoặc hiển thị "Hết hàng".',
    priority: 'Medium',
  },
  {
    id: nextId('SVC'), feature: 'Create Booking', category: 'Edge Case',
    scenario: 'Đặt dịch vụ số lượng vượt tồn kho',
    preconditions: 'Dịch vụ tồn kho = 3',
    steps: '1. Tăng số lượng lên 5\n2. Click "Đặt sân"',
    expected: 'Hiển thị lỗi "Số lượng vượt quá tồn kho".',
    priority: 'Medium',
  },
];

createSheet('7-Services', serviceTests);

// ============================================================================
// SHEET 8: USERS (ADMIN)
// ============================================================================
const userTests = [
  // POSITIVE
  {
    id: nextId('USR'), feature: 'List Users', category: 'Positive',
    scenario: 'Admin xem danh sách người dùng',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/users\n2. Xem danh sách',
    expected: 'Hiển thị tất cả users với tên, email, SĐT, vai trò, VIP, trạng thái, số booking. Có phân trang và tìm kiếm.',
    priority: 'High',
  },
  {
    id: nextId('USR'), feature: 'Update User', category: 'Positive',
    scenario: 'Admin cập nhật thông tin user',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/users\n2. Edit user\n3. Sửa tên, SĐT\n4. Click Lưu',
    expected: 'Thông tin user được cập nhật.',
    priority: 'Medium',
  },
  {
    id: nextId('USR'), feature: 'Toggle Lock', category: 'Positive',
    scenario: 'Admin khóa tài khoản user',
    preconditions: 'User đang Active',
    steps: '1. Click "Khóa" trên user\n2. Xác nhận',
    expected: 'User chuyển trạng thái "Locked". User không thể đăng nhập.',
    priority: 'High',
  },
  {
    id: nextId('USR'), feature: 'Toggle Lock', category: 'Positive',
    scenario: 'Admin mở khóa tài khoản user',
    preconditions: 'User đang Locked',
    steps: '1. Click "Mở khóa" trên user\n2. Xác nhận',
    expected: 'User chuyển trạng thái "Active". User có thể đăng nhập trở lại.',
    priority: 'High',
  },
  {
    id: nextId('USR'), feature: 'Toggle VIP', category: 'Positive',
    scenario: 'Admin nâng cấp user lên VIP',
    preconditions: 'User thường (isVIP = false)',
    steps: '1. Click "VIP" toggle\n2. Xác nhận',
    expected: 'User được đánh dấu isVIP = true. Có thể dùng mã giảm giá VIP và auto-booking.',
    priority: 'Medium',
  },
  {
    id: nextId('USR'), feature: 'Toggle VIP', category: 'Positive',
    scenario: 'Admin hạ cấp VIP xuống thường',
    preconditions: 'User đang là VIP',
    steps: '1. Click "VIP" toggle\n2. Xác nhận',
    expected: 'User không còn là VIP. Không thể dùng tính năng VIP.',
    priority: 'Medium',
  },
  {
    id: nextId('USR'), feature: 'Search Users', category: 'Positive',
    scenario: 'Admin tìm kiếm user theo tên/email',
    preconditions: 'Có user "Nguyen Van A"',
    steps: '1. Nhập từ khóa "Nguyen"\n2. Enter',
    expected: 'Hiển thị user có tên chứa "Nguyen".',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('USR'), feature: 'Toggle Lock', category: 'Negative',
    scenario: 'Admin thử khóa chính mình',
    preconditions: 'Đăng nhập admin@pickleball.com',
    steps: '1. Tìm tài khoản admin trong danh sách\n2. Click "Khóa"',
    expected: 'Hệ thống nên ngăn chặn hoặc cảnh báo. (Kiểm tra thực tế)',
    priority: 'Low',
  },
  {
    id: nextId('USR'), feature: 'Update User', category: 'Negative',
    scenario: 'Admin sửa email user thành email đã tồn tại',
    preconditions: 'Email "user2@gmail.com" đã có',
    steps: '1. Edit user 1\n2. Sửa email thành "user2@gmail.com"\n3. Click Lưu',
    expected: 'Lưu ý: API update user hiện tại không cho sửa email (chỉ name, phone, VIP, address). Email không thay đổi được.',
    priority: 'Low',
  },

  // VALIDATION
  {
    id: nextId('USR'), feature: 'Update User', category: 'Validation',
    scenario: 'Sửa số điện thoại thành định dạng không hợp lệ',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Edit user\n2. Sửa SĐT thành "abc"\n3. Click Lưu',
    expected: 'Hiển thị lỗi validation SĐT.',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('USR'), feature: 'List Users', category: 'Permission',
    scenario: 'Customer thử xem danh sách users',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: GET /api/users',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },
  {
    id: nextId('USR'), feature: 'Toggle VIP', category: 'Permission',
    scenario: 'Customer thử toggle VIP cho user khác',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: PATCH /api/users/1/toggle-vip',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('USR'), feature: 'List Users', category: 'Edge Case',
    scenario: 'Danh sách users rỗng (chỉ có admin)',
    preconditions: 'DB chỉ có 1 user admin',
    steps: '1. Vào /admin/users',
    expected: 'Hiển thị 1 user admin. Phân trang ẩn hoặc hiển thị 1 trang.',
    priority: 'Low',
  },
  {
    id: nextId('USR'), feature: 'Toggle Lock', category: 'Edge Case',
    scenario: 'User đang online bị khóa - polling phát hiện',
    preconditions: 'User A đang đăng nhập, Admin khóa User A',
    steps: '1. Admin khóa User A\n2. Chờ 15s cho polling',
    expected: 'User A bị logout và chuyển về Login.',
    priority: 'Medium',
  },
];

createSheet('8-Users', userTests);

// ============================================================================
// SHEET 9: NOTIFICATIONS
// ============================================================================
const notiTests = [
  // POSITIVE
  {
    id: nextId('NOTI'), feature: 'View Notifications', category: 'Positive',
    scenario: 'Xem danh sách thông báo',
    preconditions: 'Đăng nhập, có ít nhất 1 thông báo',
    steps: '1. Click icon chuông trên navbar\n2. Xem danh sách thông báo',
    expected: 'Hiển thị danh sách thông báo (đã đọc/chưa đọc). Có badge số thông báo chưa đọc. Phân trang.',
    priority: 'High',
  },
  {
    id: nextId('NOTI'), feature: 'Mark as Read', category: 'Positive',
    scenario: 'Đánh dấu 1 thông báo đã đọc',
    preconditions: 'Có thông báo chưa đọc',
    steps: '1. Mở dropdown thông báo\n2. Click vào 1 thông báo chưa đọc',
    expected: 'Thông báo được đánh dấu daDoc = true. Badge unread count giảm đi 1.',
    priority: 'Medium',
  },
  {
    id: nextId('NOTI'), feature: 'Mark All as Read', category: 'Positive',
    scenario: 'Đánh dấu tất cả thông báo đã đọc',
    preconditions: 'Có nhiều thông báo chưa đọc',
    steps: '1. Mở dropdown thông báo\n2. Click "Đánh dấu tất cả đã đọc"',
    expected: 'Tất cả thông báo chuyển daDoc = true. Badge unread về 0.',
    priority: 'Medium',
  },
  {
    id: nextId('NOTI'), feature: 'Notification Types', category: 'Positive',
    scenario: 'Nhận thông báo khi booking được tạo',
    preconditions: 'Đặt sân thành công',
    steps: '1. Đặt sân\n2. Kiểm tra thông báo mới',
    expected: 'Thông báo mới với tiêu đề "Đặt sân thành công", nội dung chứa thông tin booking.',
    priority: 'Medium',
  },
  {
    id: nextId('NOTI'), feature: 'Notification Types', category: 'Positive',
    scenario: 'Nhận thông báo khi booking bị hủy',
    preconditions: 'Booking bị hủy (bởi admin hoặc auto)',
    steps: '1. Kiểm tra thông báo sau khi booking bị hủy',
    expected: 'Thông báo với nội dung hủy booking.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('NOTI'), feature: 'View Notifications', category: 'Negative',
    scenario: 'Xem thông báo khi chưa đăng nhập',
    preconditions: 'Chưa đăng nhập',
    steps: '1. Gọi API: GET /api/notifications',
    expected: 'API trả về 401 Unauthorized.',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('NOTI'), feature: 'Mark as Read', category: 'Validation',
    scenario: 'Đánh dấu đã đọc thông báo không tồn tại',
    preconditions: 'Đăng nhập',
    steps: '1. Gọi API: PATCH /api/notifications/99999/read',
    expected: 'API trả về lỗi "Không tìm thấy thông báo".',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('NOTI'), feature: 'Mark as Read', category: 'Permission',
    scenario: 'User A thử đánh dấu đã đọc thông báo của User B',
    preconditions: 'Thông báo X thuộc User B, User A đăng nhập',
    steps: '1. User A gọi API: PATCH /api/notifications/{X}/read',
    expected: 'API từ chối. Chỉ chủ sở hữu thông báo mới đọc được.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('NOTI'), feature: 'View Notifications', category: 'Edge Case',
    scenario: 'Không có thông báo nào',
    preconditions: 'User mới tạo chưa có thông báo',
    steps: '1. Click icon chuông',
    expected: 'Hiển thị "Không có thông báo nào" hoặc empty state.',
    priority: 'Low',
  },
  {
    id: nextId('NOTI'), feature: 'Unread Count', category: 'Edge Case',
    scenario: 'Badge unread count hiển thị số > 99',
    preconditions: 'User có 150 thông báo chưa đọc',
    steps: '1. Quan sát badge',
    expected: 'Hiển thị "99+" thay vì "150".',
    priority: 'Low',
  },
];

createSheet('9-Notifications', notiTests);

// ============================================================================
// SHEET 10: REPORTS & DASHBOARD
// ============================================================================
const reportTests = [
  // POSITIVE
  {
    id: nextId('RPT'), feature: 'Dashboard', category: 'Positive',
    scenario: 'Admin xem dashboard tổng quan',
    preconditions: 'Đăng nhập Admin, có dữ liệu',
    steps: '1. Vào /admin\n2. Quan sát dashboard',
    expected: 'Hiển thị: Tổng số sân, Tổng users, Số booking hôm nay, Doanh thu tháng. Biểu đồ doanh thu 7 ngày gần đây (Recharts BarChart).',
    priority: 'High',
  },
  {
    id: nextId('RPT'), feature: 'Reports', category: 'Positive',
    scenario: 'Xem báo cáo doanh thu theo khoảng thời gian',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào /admin/reports\n2. Chọn ngày bắt đầu: 01/01/2026\n3. Chọn ngày kết thúc: 31/01/2026\n4. Click "Xem báo cáo"',
    expected: 'Hiển thị: tổng doanh thu, doanh thu theo ngày (BarChart), doanh thu theo sân (PieChart). Bảng chi tiết.',
    priority: 'High',
  },
  {
    id: nextId('RPT'), feature: 'Export Excel', category: 'Positive',
    scenario: 'Admin xuất báo cáo ra file Excel',
    preconditions: 'Đang xem báo cáo',
    steps: '1. Click "Xuất Excel"\n2. Chờ tải file',
    expected: 'File .xlsx được tải về. Chứa dữ liệu báo cáo đúng với khoảng thời gian đã chọn.',
    priority: 'Medium',
  },
  {
    id: nextId('RPT'), feature: 'Dashboard', category: 'Positive',
    scenario: 'Dashboard hiển thị 0 khi không có dữ liệu',
    preconditions: 'DB trống (chưa có booking)',
    steps: '1. Vào /admin',
    expected: 'Dashboard hiển thị các số 0. Biểu đồ trống hoặc hiển thị 0.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('RPT'), feature: 'Reports', category: 'Negative',
    scenario: 'Chọn ngày kết thúc trước ngày bắt đầu',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Chọn từ ngày 15/01/2026\n2. Chọn đến ngày 01/01/2026\n3. Click "Xem báo cáo"',
    expected: 'Hiển thị lỗi validation hoặc không có dữ liệu.',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('RPT'), feature: 'Dashboard', category: 'Permission',
    scenario: 'Customer thử truy cập dashboard admin',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Truy cập /admin\n2. Hoặc gọi API: GET /api/admin/dashboard',
    expected: 'Frontend chuyển hướng /forbidden. API trả về 403.',
    priority: 'High',
  },
  {
    id: nextId('RPT'), feature: 'Export Excel', category: 'Permission',
    scenario: 'Customer thử export báo cáo',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: GET /api/admin/reports/export',
    expected: 'API trả về 403 Forbidden.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('RPT'), feature: 'Reports', category: 'Edge Case',
    scenario: 'Xem báo cáo khoảng thời gian không có booking',
    preconditions: 'Không có booking nào trong tháng 1/2025',
    steps: '1. Chọn từ 01/01/2025 đến 31/01/2025\n2. Xem báo cáo',
    expected: 'Hiển thị tổng doanh thu = 0. Biểu đồ trống.',
    priority: 'Low',
  },
  {
    id: nextId('RPT'), feature: 'Reports', category: 'Edge Case',
    scenario: 'Xem báo cáo với khoảng thời gian rất lớn (1 năm)',
    preconditions: 'Có nhiều booking trong 1 năm',
    steps: '1. Chọn từ 01/01/2026 đến 31/12/2026\n2. Xem báo cáo',
    expected: 'Dữ liệu tổng hợp đúng. Không bị timeout. Biểu đồ hiển thị được.',
    priority: 'Low',
  },
];

createSheet('10-Reports', reportTests);

// ============================================================================
// SHEET 11: SCHEDULE BOARD & QR SCANNER
// ============================================================================
const scheduleTests = [
  // POSITIVE
  {
    id: nextId('SCH'), feature: 'Schedule Board', category: 'Positive',
    scenario: 'Admin xem lịch đặt sân theo tuần',
    preconditions: 'Đăng nhập Admin, có booking trong tuần',
    steps: '1. Vào /admin/schedule-board\n2. Chọn tuần hiện tại\n3. Quan sát lịch',
    expected: 'Hiển thị lịch dạng bảng: cột là các sân, hàng là các khung giờ. Booking hiển thị với tên user, trạng thái. Có đánh dấu VIP.',
    priority: 'High',
  },
  {
    id: nextId('SCH'), feature: 'Schedule Board', category: 'Positive',
    scenario: 'Lọc lịch theo sân',
    preconditions: 'Có nhiều sân',
    steps: '1. Vào /admin/schedule-board\n2. Chọn 1 sân cụ thể từ dropdown\n3. Xem lịch',
    expected: 'Chỉ hiển thị lịch của sân đã chọn.',
    priority: 'Medium',
  },
  {
    id: nextId('SCH'), feature: 'Schedule Board', category: 'Positive',
    scenario: 'Xem lịch với date range tùy chỉnh',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Chọn ngày bắt đầu và kết thúc\n2. Xem lịch',
    expected: 'Hiển thị đúng các ngày trong khoảng đã chọn.',
    priority: 'Medium',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Positive',
    scenario: 'Admin scan QR code để check-in',
    preconditions: 'Booking có QR code hợp lệ',
    steps: '1. Vào /admin/scanner\n2. Cho phép truy cập camera\n3. Quét QR code của booking\n4. Xác nhận check-in',
    expected: 'Hiển thị thông tin booking. Check-in thành công. Booking chuyển "Dang su dung".',
    priority: 'Medium',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Positive',
    scenario: 'Admin nhập mã booking thủ công để check-in',
    preconditions: 'Booking tồn tại',
    steps: '1. Vào /admin/scanner\n2. Nhập mã booking (thay vì scan)\n3. Click tìm kiếm\n4. Click Check-in',
    expected: 'Hiển thị thông tin booking và check-in thành công.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Negative',
    scenario: 'Scan QR code không hợp lệ',
    preconditions: 'Chuẩn bị QR code giả',
    steps: '1. Scan QR code không phải của hệ thống\n2. Quan sát kết quả',
    expected: 'Hiển thị lỗi "QR code không hợp lệ" hoặc "Không tìm thấy booking".',
    priority: 'Medium',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Negative',
    scenario: 'Scan QR code của booking đã hủy',
    preconditions: 'Booking đã bị hủy',
    steps: '1. Scan QR code của booking đã hủy',
    expected: 'Hiển thị lỗi "Booking đã bị hủy" hoặc không thể check-in.',
    priority: 'Medium',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Negative',
    scenario: 'Scan QR code booking đã check-in rồi',
    preconditions: 'Booking trạng thái "Dang su dung"',
    steps: '1. Scan QR code của booking đang sử dụng',
    expected: 'Hiển thị thông báo "Booking đã được check-in".',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('SCH'), feature: 'Schedule Board', category: 'Permission',
    scenario: 'Customer thử truy cập schedule board',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: GET /api/admin/schedule-board\n2. Hoặc truy cập /admin/schedule-board',
    expected: 'API trả về 403. Frontend chuyển hướng forbidden.',
    priority: 'High',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Permission',
    scenario: 'Customer thử truy cập QR scanner',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Truy cập /admin/scanner',
    expected: 'Chuyển hướng /forbidden. Chỉ admin mới truy cập được.',
    priority: 'High',
  },

  // EDGE CASES
  {
    id: nextId('SCH'), feature: 'Schedule Board', category: 'Edge Case',
    scenario: 'Schedule board với tuần không có booking nào',
    preconditions: 'Không có booking trong tuần đã chọn',
    steps: '1. Vào /admin/schedule-board\n2. Chọn tuần không có booking',
    expected: 'Hiển thị lịch trống. Không crash.',
    priority: 'Low',
  },
  {
    id: nextId('SCH'), feature: 'QR Scanner', category: 'Edge Case',
    scenario: 'Camera không khả dụng / user từ chối quyền',
    preconditions: 'Trình duyệt không có camera hoặc user từ chối',
    steps: '1. Vào /admin/scanner\n2. Từ chối quyền camera',
    expected: 'Hiển thị thông báo "Không thể truy cập camera". Vẫn có thể nhập mã thủ công.',
    priority: 'Low',
  },
];

createSheet('11-Schedule-QR', scheduleTests);

// ============================================================================
// SHEET 12: VIP AUTO-BOOKING & LOYALTY
// ============================================================================
const vipTests = [
  // POSITIVE
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Positive',
    scenario: 'VIP user bật auto-booking khi đặt sân',
    preconditions: 'Đăng nhập với tài khoản VIP, đặt sân',
    steps: '1. Vào đặt sân\n2. Chọn sân + slot\n3. Bật toggle "Tự động đặt lịch hàng tuần"\n4. Click "Đặt sân"',
    expected: 'Booking được tạo với isAutoBooking = true. Hệ thống sẽ tự động đặt lại vào thứ 2 tuần sau.',
    priority: 'Medium',
  },
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Positive',
    scenario: 'Scheduler tự động tạo booking VIP hàng tuần',
    preconditions: 'VIP user có auto-booking, hôm nay là thứ 2 00:01',
    steps: '1. Chờ scheduler chạy (thứ 2 00:01)\n2. Kiểm tra booking mới của VIP',
    expected: 'Booking mới được tạo cho 7 ngày sau với cùng sân và slot. tiền đặt cọc = 10% giá sân. Notification được gửi.',
    priority: 'Medium',
  },
  {
    id: nextId('VIP'), feature: 'Loyalty Rewards', category: 'Positive',
    scenario: 'Nhận mã giảm giá loyalty sau mỗi 3 booking hoàn thành',
    preconditions: 'User có 2 booking hoàn thành',
    steps: '1. Hoàn thành thêm 1 booking nữa (tổng 3)\n2. Kiểm tra thông báo và vouchers',
    expected: 'Mã giảm giá LTY10-XXXX được tạo (10%). Notification gửi đến user.',
    priority: 'Medium',
  },
  {
    id: nextId('VIP'), feature: 'Loyalty Rewards', category: 'Positive',
    scenario: 'Nhận loyalty reward lần 2 (6 booking)',
    preconditions: 'User đã có 3 booking hoàn thành (đã nhận loyalty 1 lần)',
    steps: '1. Hoàn thành thêm 3 booking nữa (tổng 6)\n2. Kiểm tra vouchers',
    expected: 'Mã giảm giá LTY10 mới được tạo (lần 2).',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Negative',
    scenario: 'User thường thử bật auto-booking',
    preconditions: 'Đăng nhập với tài khoản thường (không VIP)',
    steps: '1. Vào đặt sân\n2. Kiểm tra xem có toggle auto-booking không',
    expected: 'Toggle auto-booking không hiển thị hoặc bị disable cho user thường.',
    priority: 'Medium',
  },
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Negative',
    scenario: 'Slot VIP auto-booking bị conflict - bị người khác đặt trước',
    preconditions: 'VIP có auto-booking slot A thứ 2, nhưng user khác đã đặt slot đó',
    steps: '1. Scheduler chạy\n2. Kiểm tra kết quả',
    expected: 'Auto-booking bị hủy. VIP nhận thông báo conflict. isAutoBooking bị tắt cho slot đó.',
    priority: 'Medium',
  },
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Negative',
    scenario: 'User thường đặt trúng slot VIP auto-booking',
    preconditions: 'VIP có auto-booking slot A, user thường đặt slot A cùng ngày',
    steps: '1. User thường đặt slot A\n2. Kiểm tra auto-booking của VIP',
    expected: 'VIP bị tắt auto-booking cho slot đó và nhận thông báo.',
    priority: 'Low',
  },

  // VALIDATION
  {
    id: nextId('VIP'), feature: 'Loyalty Rewards', category: 'Validation',
    scenario: 'Kiểm tra loyalty không trigger cho booking bị hủy',
    preconditions: 'User có 2 booking hoàn thành và 1 booking hủy',
    steps: '1. Kiểm tra xem có nhận loyalty không',
    expected: 'Không nhận loyalty. Chỉ tính booking "Hoan thanh".',
    priority: 'Medium',
  },

  // PERMISSION
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Permission',
    scenario: 'User thường gọi API auto-booking',
    preconditions: 'Đăng nhập user thường',
    steps: '1. Thử tạo booking với isAutoBooking = true qua API',
    expected: 'API nên kiểm tra isVIP trước khi cho phép auto-booking.',
    priority: 'Medium',
  },

  // EDGE CASES
  {
    id: nextId('VIP'), feature: 'VIP Auto-Booking', category: 'Edge Case',
    scenario: 'VIP auto-booking qua nhiều tuần (7 tuần liên tiếp)',
    preconditions: 'VIP bật auto-booking, không có conflict trong 7 tuần',
    steps: '1. Theo dõi auto-booking trong 7 tuần\n2. Kiểm tra các booking được tạo',
    expected: 'Mỗi thứ 2, booking mới được tạo cho 7 ngày sau. Tất cả đều isAutoBooking = true.',
    priority: 'Low',
  },
  {
    id: nextId('VIP'), feature: 'Loyalty Rewards', category: 'Edge Case',
    scenario: 'User có chính xác 3 booking - loyalty trigger 1 lần',
    preconditions: 'User có 3 booking hoàn thành',
    steps: '1. Hoàn thành booking thứ 3\n2. Kiểm tra số lượng loyalty codes\n3. Hoàn thành booking thứ 4 (không phải bội số của 3)',
    expected: 'Chỉ 1 loyalty code được tạo (khi đạt 3). Booking thứ 4 không tạo thêm code. Đến booking thứ 6 mới tạo tiếp.',
    priority: 'Low',
  },
];

createSheet('12-VIP-Loyalty', vipTests);

// ============================================================================
// SHEET 13: UPLOAD
// ============================================================================
const uploadTests = [
  // POSITIVE
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Positive',
    scenario: 'Upload ảnh đại diện (avatar)',
    preconditions: 'Đăng nhập',
    steps: '1. Vào Profile\n2. Click upload avatar\n3. Chọn file ảnh .jpg (< 10MB)\n4. Click Upload',
    expected: 'Ảnh được upload lên server/public/uploads/. Avatar hiển thị mới.',
    priority: 'Medium',
  },
  {
    id: nextId('UPL'), feature: 'Upload Court Images', category: 'Positive',
    scenario: 'Admin upload ảnh cho sân',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Vào edit sân\n2. Chọn upload ảnh\n3. Chọn 5 file .jpg\n4. Click Upload',
    expected: '5 ảnh được upload. Records trong court_images được tạo. Ảnh hiển thị trong gallery sân.',
    priority: 'Medium',
  },
  {
    id: nextId('UPL'), feature: 'Upload Court Images', category: 'Positive',
    scenario: 'Upload ảnh PNG',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Upload file .png\n2. Click Upload',
    expected: 'Ảnh PNG được chấp nhận và upload thành công.',
    priority: 'Low',
  },

  // NEGATIVE
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Negative',
    scenario: 'Upload file không phải ảnh (PDF)',
    preconditions: 'Đăng nhập',
    steps: '1. Thử upload file .pdf\n2. Click Upload',
    expected: 'Hiển thị lỗi "Chỉ chấp nhận file ảnh".',
    priority: 'Medium',
  },
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Negative',
    scenario: 'Upload file quá 10MB',
    preconditions: 'Đăng nhập, chuẩn bị file ảnh > 10MB',
    steps: '1. Thử upload file > 10MB\n2. Click Upload',
    expected: 'Hiển thị lỗi "File quá lớn. Kích thước tối đa 10MB".',
    priority: 'Medium',
  },
  {
    id: nextId('UPL'), feature: 'Upload Court Images', category: 'Negative',
    scenario: 'Upload quá 10 ảnh cho 1 sân',
    preconditions: 'Sân đã có 10 ảnh',
    steps: '1. Thử upload thêm ảnh',
    expected: 'Hiển thị lỗi "Tối đa 10 ảnh mỗi sân".',
    priority: 'Medium',
  },

  // VALIDATION
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Validation',
    scenario: 'Upload file rỗng (0 byte)',
    preconditions: 'Đăng nhập',
    steps: '1. Thử upload file 0 byte',
    expected: 'Hiển thị lỗi validation.',
    priority: 'Low',
  },

  // PERMISSION
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Permission',
    scenario: 'Upload file khi chưa đăng nhập',
    preconditions: 'Chưa đăng nhập',
    steps: '1. Gọi API: POST /api/upload',
    expected: 'API trả về 401 Unauthorized.',
    priority: 'High',
  },
  {
    id: nextId('UPL'), feature: 'Upload Court Images', category: 'Permission',
    scenario: 'Customer thử upload ảnh sân',
    preconditions: 'Đăng nhập Customer',
    steps: '1. Gọi API: POST /api/upload/court-images',
    expected: 'API trả về 403 Forbidden (chỉ admin).',
    priority: 'Medium',
  },

  // EDGE CASES
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Edge Case',
    scenario: 'Upload file có tên Unicode',
    preconditions: 'Đăng nhập',
    steps: '1. Upload file tên "ảnh-sân-đẹp.jpg"',
    expected: 'File được upload và lưu với tên an toàn (đã sanitize).',
    priority: 'Low',
  },
  {
    id: nextId('UPL'), feature: 'Upload File', category: 'Edge Case',
    scenario: 'Upload ảnh có nội dung không phải ảnh (giả mạo extension)',
    preconditions: 'Đổi tên file .txt thành .jpg',
    steps: '1. Upload file giả mạo\n2. Kiểm tra kết quả',
    expected: 'Hệ thống nên kiểm tra MIME type thực tế không chỉ extension.',
    priority: 'Low',
  },
];

createSheet('13-Upload', uploadTests);

// ============================================================================
// SHEET 14: SCHEDULER (CRON JOBS)
// ============================================================================
const schedulerTests = [
  // POSITIVE
  {
    id: nextId('CRON'), feature: 'Auto Check-out', category: 'Positive',
    scenario: 'Scheduler tự động check-out booking đã hết giờ',
    preconditions: 'Booking trạng thái "Dang su dung", giờ kết thúc đã qua 1 phút',
    steps: '1. Chờ scheduler chạy (mỗi phút)\n2. Kiểm tra trạng thái booking',
    expected: 'Booking chuyển trạng thái "Hoan thanh". Notification được gửi cho user.',
    priority: 'High',
  },
  {
    id: nextId('CRON'), feature: 'Auto Cancel No-Show', category: 'Positive',
    scenario: 'Scheduler tự động hủy booking no-show (quá 15 phút)',
    preconditions: 'Booking trạng thái "Da thanh toan", giờ bắt đầu 14:00, hiện tại 14:16',
    steps: '1. Chờ scheduler chạy\n2. Kiểm tra trạng thái booking',
    expected: 'Booking chuyển "Da huy" với ghi chú "No-show". Notification gửi cho user.',
    priority: 'High',
  },
  {
    id: nextId('CRON'), feature: 'Auto Cancel Past', category: 'Positive',
    scenario: 'Scheduler hủy auto-booking quá khứ chưa thanh toán (00:05 mỗi ngày)',
    preconditions: 'Có auto-booking quá khứ trạng thái "Da dat" (chưa thanh toán)',
    steps: '1. Chờ scheduler 00:05 chạy\n2. Kiểm tra booking',
    expected: 'Booking chuyển "Da huy". Notification gửi cho user.',
    priority: 'Medium',
  },
  {
    id: nextId('CRON'), feature: 'VIP Auto-Booking', category: 'Positive',
    scenario: 'Scheduler tạo booking VIP vào mỗi thứ 2 00:01',
    preconditions: 'VIP có auto-booking, hôm nay thứ 2',
    steps: '1. Chờ scheduler 00:01 thứ 2 chạy\n2. Kiểm tra booking mới',
    expected: 'Booking mới được tạo cho 7 ngày sau với tiền cọc 10%. Notification cho VIP.',
    priority: 'Medium',
  },

  // NEGATIVE
  {
    id: nextId('CRON'), feature: 'Auto Cancel No-Show', category: 'Negative',
    scenario: 'Booking đã check-in không bị no-show',
    preconditions: 'Booking trạng thái "Dang su dung" đã check-in',
    steps: '1. Chờ quá 15 phút từ giờ bắt đầu\n2. Kiểm tra booking',
    expected: 'Booking không bị hủy. Vẫn giữ trạng thái "Dang su dung".',
    priority: 'Medium',
  },
  {
    id: nextId('CRON'), feature: 'Auto Check-out', category: 'Negative',
    scenario: 'Booking chưa check-in không bị auto check-out',
    preconditions: 'Booking trạng thái "Da thanh toan" quá giờ kết thúc nhưng chưa check-in',
    steps: '1. Chờ scheduler\n2. Kiểm tra booking',
    expected: 'Booking không chuyển "Hoan thanh". Sẽ bị no-show cancel (sau 15 phút) thay vì check-out.',
    priority: 'Medium',
  },

  // EDGE CASES
  {
    id: nextId('CRON'), feature: 'Auto Cancel No-Show', category: 'Edge Case',
    scenario: 'No-show chính xác tại phút thứ 15',
    preconditions: 'Booking giờ bắt đầu 14:00, scheduler chạy lúc 14:15',
    steps: '1. Kiểm tra booking lúc 14:15',
    expected: 'Booking bị hủy no-show (>= 15 phút). Cần xác định chính xác logic >= hay >.',
    priority: 'Medium',
  },
  {
    id: nextId('CRON'), feature: 'Auto Check-out', category: 'Edge Case',
    scenario: 'Nhiều booking cùng hết giờ - scheduler xử lý hàng loạt',
    preconditions: '10 booking "Dang su dung" cùng giờ kết thúc',
    steps: '1. Chờ scheduler xử lý\n2. Kiểm tra tất cả booking',
    expected: 'Tất cả 10 booking đều được check-out. Không bỏ sót booking nào.',
    priority: 'Low',
  },
  {
    id: nextId('CRON'), feature: 'VIP Auto-Booking', category: 'Edge Case',
    scenario: 'Scheduler VIP gặp lỗi DB connection tạm thời',
    preconditions: 'DB connection bị gián đoạn khi scheduler chạy',
    steps: '1. DB mất kết nối\n2. Scheduler thử chạy\n3. DB khôi phục',
    expected: 'Scheduler nên có error handling. Không crash server. Sẽ thử lại vào lần chạy tiếp theo.',
    priority: 'Low',
  },
  {
    id: nextId('CRON'), feature: 'Manual Trigger', category: 'Edge Case',
    scenario: 'Admin trigger thủ công cancel past bookings',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Gọi API: POST /api/admin/trigger-cancel-past',
    expected: 'Thực thi ngay job cancel past. Kết quả trả về thành công.',
    priority: 'Low',
  },
  {
    id: nextId('CRON'), feature: 'Manual Trigger', category: 'Edge Case',
    scenario: 'Admin trigger thủ công VIP auto-booking',
    preconditions: 'Đăng nhập Admin',
    steps: '1. Gọi API: POST /api/admin/trigger-vip-auto-book',
    expected: 'Thực thi ngay job VIP auto-booking. Kết quả trả về thành công.',
    priority: 'Low',
  },
];

createSheet('14-Scheduler', schedulerTests);

// ============================================================================
// SAVE FILE
// ============================================================================
const outputPath = 'C:\\Users\\Admin\\Downloads\\KLTN\\pickleball-booking\\docs\\ManualTestCases.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log(`Excel file saved to: ${outputPath}`);
    let totalCases = 0;
    workbook.eachSheet((sheet) => {
      const count = sheet.rowCount - 1; // minus header
      totalCases += count;
      console.log(`  ${sheet.name}: ${count} test cases`);
    });
    console.log(`\nTotal: ${totalCases} test cases across ${workbook.worksheets.length} sheets`);
  })
  .catch((err) => {
    console.error('Error writing Excel file:', err);
  });
