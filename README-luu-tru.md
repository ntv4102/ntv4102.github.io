# Lưu trữ ghi chú bằng GitHub OAuth

Ứng dụng dùng Cloudflare Worker làm proxy OAuth. Người dùng đăng nhập
GitHub trên trang GitHub; access token chỉ được lưu phía server trong
Workers KV. App nhận một mã phiên opaque dùng riêng cho Worker, không
phải GitHub token, để hoạt động ổn định giữa GitHub Pages và Worker.

## Cấu hình Cloudflare Worker

Worker URL mặc định:

`https://so-tay-kien-thuc-ap.ntv-4102.workers.dev`

Tạo một GitHub OAuth App với callback:

`https://so-tay-kien-thuc-ap.ntv-4102.workers.dev/auth/callback`

Trong Cloudflare Worker, thêm các biến/secret:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET` (Secret)
- `GITHUB_REPO_OWNER` = `ntv4102`
- `GITHUB_REPO_NAME` = `ntv4102.github.io`

Thêm KV namespace binding tên `OAUTH_SESSIONS_KV`. Worker này dùng namespace
đó cho OAuth state và session token. Không đưa client secret vào
[app.js](./app.js) hoặc repository website.

## Đăng nhập và lưu

1. Mở ứng dụng và bấm **Đăng nhập GitHub**.
2. Chấp nhận quyền của OAuth App trên GitHub.
3. GitHub chuyển về callback rồi quay lại ứng dụng.
4. Từ đó app gọi Worker; Worker gọi GitHub Contents API thay mặt người dùng.

Các file trong repository:

```text
thu-muc-1/
└─ thu-1/
   ├─ index.json
   ├─ last.json
   └─ notes/
      └─ <id>.json
```

`index.json` chứa metadata cây thư mục (`folders`) và danh sách note
(`notes`). Folder con liên kết với folder cha qua `parentId`, còn note liên
kết folder qua `folderId`; nội dung note vẫn nằm trong `notes/<id>.json`.

Worker dùng `GITHUB_REPO_PATH` nếu được cấu hình; nếu không, giá trị mặc
định là `thu-muc-1/thu-1`.

Sau khi đã tải dữ liệu, app giữ cache cục bộ để xem offline ở chế độ chỉ
đọc. Muốn sửa, tạo hoặc xóa note cần phiên OAuth còn hiệu lực.

## An toàn

- Không còn nhập hoặc lưu GitHub token ở frontend.
- Session opaque được lưu ở trình duyệt và gửi qua `Authorization` tới
  Worker; GitHub token không bao giờ rời khỏi Worker.
- OAuth state có thời hạn 10 phút.
- Session Worker có thời hạn 30 ngày.
- Chỉ cấp quyền repository cần thiết cho OAuth App và giới hạn repository
  trong GitHub App settings nếu phù hợp.
