# Lưu trữ ghi chú bằng GitHub OAuth

Ứng dụng dùng Cloudflare Worker làm proxy OAuth. Người dùng đăng nhập
GitHub trên trang GitHub; access token chỉ được lưu phía server trong
Workers KV, trình duyệt chỉ giữ cookie phiên `HttpOnly`.

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
index.json
last.json
notes/<id>.json
```

Sau khi đã tải dữ liệu, app giữ cache cục bộ để xem offline ở chế độ chỉ
đọc. Muốn sửa, tạo hoặc xóa note cần phiên OAuth còn hiệu lực.

## An toàn

- Không còn nhập hoặc lưu GitHub token ở frontend.
- Cookie phiên dùng `HttpOnly`, `Secure`, `SameSite=None`.
- OAuth state có thời hạn 10 phút.
- Session Worker có thời hạn 30 ngày.
- Chỉ cấp quyền repository cần thiết cho OAuth App và giới hạn repository
  trong GitHub App settings nếu phù hợp.
