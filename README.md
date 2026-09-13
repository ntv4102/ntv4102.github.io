# Sổ tay kiến thức

Ứng dụng ghi chú cá nhân dạng trang tĩnh (HTML/CSS/JS thuần, không
build tool, không framework). Chạy được trên GitHub Pages, Netlify,
Cloudflare Pages hoặc hosting tĩnh khác. Dữ liệu được lưu trong một
repository GitHub riêng tư.

## Cấu trúc

```text
index.html                    Giao diện
style.css                     Định dạng
app.js                        Logic soạn thảo và lưu trữ
worker.js                     Backend Cloudflare OAuth proxy
so-tay-kien-thuc-backup.json  Bản sao lưu mẫu
data/                         Dữ liệu mẫu cũ
```

Ứng dụng gọi `worker.js` như một proxy OAuth. GitHub access token chỉ nằm
trong phiên làm việc ở Workers KV, không bao giờ được gửi tới trình duyệt.

## Lưu trữ bằng GitHub

Tạo một repository **private** riêng cho note. Worker OAuth cần các biến:
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REPO_OWNER`,
`GITHUB_REPO_NAME`, cùng KV binding `OAUTH_SESSIONS_KV`. Có thể thêm
`GITHUB_REPO_PATH` để đặt thư mục lưu, mặc định là `thu-muc-1/thu-1`.
Tạo GitHub OAuth
App và đặt callback URL chính xác:

`https://so-tay-kien-thuc-ap.ntv4102.workers.dev/auth/callback`

Đăng nhập bằng nút trong app sẽ chuyển tới GitHub. Token được giữ server-side
trong KV; trình duyệt chỉ nhận cookie phiên HttpOnly.

Các file được dùng trong repository:

```text
thu-muc-1/
└─ thu-1/
   ├─ index.json
   ├─ last.json
   └─ notes/
      └─ <id>.json
```

`index.json` lưu cây thư mục dưới dạng `{ "folders": [...], "notes": [...] }`.
Mỗi folder có `id`, `name`, `parentId`; mỗi note có `folderId`. Sidebar
hiển thị cây này theo cấp, bấm mũi tên để mở thư mục con và tự co giãn trên
thiết bị nhỏ.

Mỗi lần lưu tạo hoặc cập nhật một commit qua GitHub Contents API. Vì
vậy repository có lịch sử thay đổi để khôi phục khi cần, và không còn
URL công khai nào đóng vai trò như mật khẩu.

Sau khi đã tải dữ liệu, app giữ một bản cache cục bộ. Nếu chưa kết nối
hoặc tạm mất mạng, vẫn có thể xem note ở chế độ chỉ đọc; muốn sửa và
đồng bộ phải kết nối GitHub.

## Lưu ý khi sử dụng

- Nhấn `Ctrl+S` hoặc `Cmd+S`, chờ trạng thái **Đã lưu** trước khi đóng tab.
- Nếu GitHub hoặc mạng lỗi, thanh trạng thái sẽ báo rõ; dùng **Xuất sao
  lưu** để giữ một bản JSON thủ công.
- Không đưa `GITHUB_CLIENT_SECRET` vào mã tĩnh hoặc repository.
- **Xuất sao lưu** gom `index` và toàn bộ note thành một file JSON.
  **Nhập lại** ghi dữ liệu đó vào repository GitHub hiện tại.

## Tính năng soạn thảo

Toolbar hỗ trợ tiêu đề, định dạng chữ, căn lề, danh sách, trích dẫn,
mục Đúng/Sai, bảng có thể thay đổi kích thước và dán nội dung từ Word,
Google Docs, website hoặc ChatGPT.
