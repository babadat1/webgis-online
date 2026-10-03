const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ file giao diện Web tĩnh (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// CẤU HÌNH KẾT NỐI DATABASE POSTGRESQL ONLINE
// ==========================================
// Thay bằng connection string thực tế từ Neon của bạn nếu chưa đổi
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-HOST.aws.neon.tech/neondb?sslmode=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Kiểm tra kết nối DB
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Lỗi kết nối CSDL (Hãy chắc chắn bạn đã cấu hình đúng link Neon):', err.stack);
  }
  console.log('Đã kết nối thành công tới Database PostgreSQL (Neon)!');
  release();
});

// ==========================================
// API: Nhận dữ liệu cập nhật từ giao diện và Lưu vào Database
// ==========================================
app.post('/api/save-feature', async (req, res) => {
    const { id, properties, geometry } = req.body;
    try {
        const query = `
            INSERT INTO geojson_features (feature_id, properties, geometry, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (feature_id) 
            DO UPDATE SET 
                properties = EXCLUDED.properties, 
                geometry = EXCLUDED.geometry,
                updated_at = CURRENT_TIMESTAMP;
        `;
        await pool.query(query, [id, properties, geometry]);
        res.json({ success: true, message: 'Đã lưu thành công vào Database!' });
    } catch (err) {
        console.error('Lỗi khi lưu DB:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// API: Tải toàn bộ dữ liệu từ Database trả về Web
// ==========================================
app.get('/api/get-features', async (req, res) => {
    try {
        const result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features');
        
        const geojson = {
            type: "FeatureCollection",
            features: result.rows.map(row => ({
                type: "Feature",
                id: row.feature_id,
                properties: row.properties,
                geometry: row.geometry
            }))
        };
        res.json(geojson);
    } catch (err) {
        console.error('Lỗi lấy dữ liệu DB:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CẤU HÌNH PORT CHO RENDER.COM
// ==========================================
// Render.com yêu cầu dùng process.env.PORT, nếu chạy trên máy tính thì mặc định cổng 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Máy chủ WebGIS đang chạy tại PORT: ${PORT}`);
    console.log(`=========================================`);
});
