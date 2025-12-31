const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Hỗ trợ JSON
app.use(express.urlencoded({ extended: true })); // Hỗ trợ x-www-form-urlencoded
const upload = multer(); // Hỗ trợ form-data (không lưu file, chỉ parse fields)
app.use('/images', express.static(path.join(__dirname, 'output')));

// Middleware tự động xử lý tất cả các format (JSON, form-data, x-www-form-urlencoded)
const handleAllFormats = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // Nếu là multipart/form-data thì dùng multer để parse
  if (contentType.includes('multipart/form-data')) {
    return upload.none()(req, res, next);
  }
  
  // Các format khác (JSON, x-www-form-urlencoded) đã được xử lý bởi middleware trước đó
  next();
};

// Đảm bảo thư mục output tồn tại
const OUTPUT_DIR = path.join(__dirname, 'output');
const ensureOutputDir = async () => {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error('Lỗi khi tạo thư mục output:', error);
  }
};

// Hàm tải ảnh từ URL
const downloadImage = async (imageUrl) => {
  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 30000, // 30 giây timeout
    });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    throw new Error(`Không thể tải ảnh từ URL: ${error.message}`);
  }
};

// Hàm cắt ảnh theo grid
const splitImage = async (imageBuffer, gridX, gridY, expirationMs = 24 * 60 * 60 * 1000) => {
  try {
    const sharpInstance = sharp(imageBuffer);
    const metadata = await sharpInstance.metadata();
    const width = metadata.width;
    const height = metadata.height;
    const format = metadata.format; // jpeg, png, webp, gif, svg, tiff, avif, heic, raw, etc.
    
    // Xác định extension dựa trên format
    const formatMap = {
      'jpeg': 'jpg',
      'jpg': 'jpg',
      'png': 'png',
      'webp': 'webp',
      'gif': 'gif',
      'svg': 'svg',
      'tiff': 'tiff',
      'tif': 'tiff',
      'avif': 'avif',
      'heic': 'heic',
      'heif': 'heic',
      'raw': 'raw',
      'bmp': 'bmp',
      'ico': 'ico'
    };
    
    const extension = formatMap[format?.toLowerCase()] || 'jpg';
    
    const tileWidth = Math.floor(width / gridX);
    const tileHeight = Math.floor(height / gridY);
    
    const tiles = [];
    const timestamp = Date.now();
    const sessionId = `split_${timestamp}`;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expirationMs).toISOString();
    
    for (let y = 0; y < gridY; y++) {
      for (let x = 0; x < gridX; x++) {
        const left = x * tileWidth;
        const top = y * tileHeight;
        
        // Tạo sharp instance mới từ buffer gốc cho mỗi tile
        let tileSharp = sharp(imageBuffer).extract({
          left,
          top,
          width: tileWidth,
          height: tileHeight
        });
        
        const filename = `${sessionId}_${x}_${y}.${extension}`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        // Xử lý từng định dạng với options phù hợp
        switch (format?.toLowerCase()) {
          case 'jpeg':
          case 'jpg':
            await tileSharp.jpeg({ quality: 90 }).toFile(filepath);
            break;
          case 'png':
            await tileSharp.png({ compressionLevel: 9 }).toFile(filepath);
            break;
          case 'webp':
            await tileSharp.webp({ quality: 90 }).toFile(filepath);
            break;
          case 'gif':
            await tileSharp.gif().toFile(filepath);
            break;
          case 'tiff':
          case 'tif':
            await tileSharp.tiff({ compression: 'lzw' }).toFile(filepath);
            break;
          case 'avif':
            await tileSharp.avif({ quality: 90 }).toFile(filepath);
            break;
          case 'heic':
          case 'heif':
            await tileSharp.heif({ quality: 90 }).toFile(filepath);
            break;
          case 'bmp':
            await tileSharp.bmp().toFile(filepath);
            break;
          default:
            // Mặc định chuyển sang JPEG nếu format không được hỗ trợ trực tiếp
            const jpgFilename = filename.replace(/\.\w+$/, '.jpg');
            const jpgFilepath = path.join(OUTPUT_DIR, jpgFilename);
            await tileSharp.jpeg({ quality: 90 }).toFile(jpgFilepath);
            
            // Lưu thông tin về thời gian tạo để xóa sau
            const jpgInfoPath = path.join(OUTPUT_DIR, `${jpgFilename}.info`);
            await fs.writeFile(jpgInfoPath, JSON.stringify({
              createdAt,
              expiresAt,
              format: 'jpeg'
            }));
            
            tiles.push({
              filename: jpgFilename,
              url: `/images/${jpgFilename}`,
              position: { x, y },
              format: 'jpeg'
            });
            continue;
        }
        
        // Lưu thông tin về thời gian tạo để xóa sau
        const infoPath = path.join(OUTPUT_DIR, `${filename}.info`);
        await fs.writeFile(infoPath, JSON.stringify({
          createdAt,
          expiresAt,
          format: format || 'unknown'
        }));
        
        tiles.push({
          filename,
          url: `/images/${filename}`,
          position: { x, y },
          format: format || 'unknown'
        });
      }
    }
    
    return { tiles, sessionId, originalFormat: format };
  } catch (error) {
    throw new Error(`Lỗi khi cắt ảnh: ${error.message}`);
  }
};

// API endpoint để cắt ảnh
app.post('/api/split-image', handleAllFormats, async (req, res) => {
  try {
    const { imageUrl, grid, expiresInDays } = req.body;
    
    // Validation
    if (!imageUrl) {
      return res.status(400).json({ error: 'Thiếu tham số imageUrl' });
    }
    
    if (!grid || !grid.match(/^\d+x\d+$/)) {
      return res.status(400).json({ 
        error: 'Tham số grid không hợp lệ. Ví dụ: "2x2", "3x3"' 
      });
    }
    
    // Parse grid
    const [gridX, gridY] = grid.split('x').map(Number);
    
    if (gridX < 1 || gridY < 1 || gridX > 10 || gridY > 10) {
      return res.status(400).json({ 
        error: 'Grid phải từ 1x1 đến 10x10' 
      });
    }
    
    // Xác định thời gian tồn tại (mặc định 1 ngày)
    const expirationDays = expiresInDays || 1;
    const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
    
    // Tải ảnh
    const imageBuffer = await downloadImage(imageUrl);
    
    // Cắt ảnh với thời gian hết hạn
    const { tiles, sessionId, originalFormat } = await splitImage(imageBuffer, gridX, gridY, expirationMs);
    
    res.json({
      success: true,
      sessionId,
      grid: `${gridX}x${gridY}`,
      tilesCount: tiles.length,
      expiresInDays: expirationDays,
      originalFormat: originalFormat || 'unknown',
      tiles,
      baseUrl: req.protocol + '://' + req.get('host')
    });
    
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({ 
      error: 'Lỗi khi xử lý ảnh', 
      message: error.message 
    });
  }
});

// Hàm xóa ảnh đã hết hạn
const cleanExpiredImages = async () => {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const now = new Date();
    
    for (const file of files) {
      if (file.endsWith('.info')) {
        const infoPath = path.join(OUTPUT_DIR, file);
        const infoContent = await fs.readFile(infoPath, 'utf-8');
        const info = JSON.parse(infoContent);
        
        if (new Date(info.expiresAt) < now) {
          // Xóa file ảnh và file info
          const imageFilename = file.replace('.info', '');
          const imagePath = path.join(OUTPUT_DIR, imageFilename);
          
          try {
            await fs.unlink(imagePath);
            await fs.unlink(infoPath);
            console.log(`Đã xóa file hết hạn: ${imageFilename}`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${imageFilename}:`, err);
          }
        }
      }
    }
  } catch (error) {
    console.error('Lỗi khi dọn dẹp ảnh:', error);
  }
};

// Chạy cleanup mỗi giờ
cron.schedule('0 * * * *', () => {
  console.log('Đang dọn dẹp ảnh hết hạn...');
  cleanExpiredImages();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Khởi động server
const startServer = async () => {
  await ensureOutputDir();
  
  // Chạy cleanup ngay khi khởi động
  await cleanExpiredImages();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`📁 Ảnh được lưu tại: ${OUTPUT_DIR}`);
    console.log(`🧹 Tự động dọn dẹp ảnh hết hạn mỗi giờ`);
  });
};

startServer().catch(console.error);

