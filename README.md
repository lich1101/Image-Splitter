# Image Splitter Tool

Tool cắt ảnh thành nhiều phần theo grid với API RESTful.

## Tính năng

- ✅ Cắt ảnh từ URL thành nhiều phần theo grid (2x2, 3x3, v.v.)
- ✅ Lưu ảnh đã cắt vào thư mục trong dự án
- ✅ Tự động xóa ảnh sau thời gian chỉ định (mặc định 1 ngày)
- ✅ Có thể điều chỉnh thời gian tồn tại của ảnh qua API
- ✅ Tự động dọn dẹp ảnh hết hạn mỗi giờ

## Cài đặt

```bash
npm install
```

## Chạy server

```bash
npm start
```

Server sẽ chạy tại `http://localhost:3000` (hoặc port được chỉ định qua biến môi trường PORT)

## API Documentation

### POST /api/split-image

Cắt ảnh thành nhiều phần theo grid.

#### Request Body

```json
{
  "imageUrl": "https://example.com/image.jpg",
  "grid": "3x3",
  "expiresInDays": 1
}
```

#### Parameters

- `imageUrl` (required): URL của ảnh cần cắt
- `grid` (required): Tỷ lệ cắt (ví dụ: "2x2", "3x3", "4x4")
- `expiresInDays` (optional): Thời gian tồn tại của ảnh (số ngày, mặc định: 1)

#### Response

```json
{
  "success": true,
  "sessionId": "split_1234567890",
  "grid": "3x3",
  "tilesCount": 9,
  "expiresInDays": 1,
  "baseUrl": "http://localhost:3000",
  "tiles": [
    {
      "filename": "split_1234567890_0_0.jpg",
      "url": "/images/split_1234567890_0_0.jpg",
      "position": { "x": 0, "y": 0 }
    },
    {
      "filename": "split_1234567890_1_0.jpg",
      "url": "/images/split_1234567890_1_0.jpg",
      "position": { "x": 1, "y": 0 }
    }
    // ... các ảnh khác
  ]
}
```

#### Ví dụ sử dụng với cURL

```bash
curl -X POST http://localhost:3000/api/split-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/image.jpg",
    "grid": "3x3",
    "expiresInDays": 1
  }'
```

#### Ví dụ sử dụng với JavaScript

```javascript
const response = await fetch('http://localhost:3000/api/split-image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    imageUrl: 'https://example.com/image.jpg',
    grid: '3x3',
    expiresInDays: 1
  })
});

const data = await response.json();
console.log(data.tiles); // Mảng chứa các ảnh đã cắt
```

### GET /api/health

Kiểm tra trạng thái của server.

#### Response

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Truy cập ảnh đã cắt

Sau khi cắt ảnh, bạn có thể truy cập các ảnh đã cắt qua URL:

```
http://localhost:3000/images/{filename}
```

Ví dụ: `http://localhost:3000/images/split_1234567890_0_0.jpg`

## Cấu trúc thư mục

```
Image Splitter/
├── server.js          # File server chính
├── package.json       # Dependencies
├── output/            # Thư mục chứa ảnh đã cắt (tự động tạo)
└── README.md          # File này
```

## Lưu ý

- Ảnh sẽ tự động bị xóa sau thời gian chỉ định (mặc định 1 ngày)
- Server tự động dọn dẹp ảnh hết hạn mỗi giờ
- Grid hỗ trợ từ 1x1 đến 10x10
- Ảnh được lưu dưới định dạng JPEG với chất lượng 90%

## License

ISC

