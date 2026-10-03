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
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_gMTNKqx9r2Gu@ep-delicate-meadow-b373h7eq-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Kiểm tra kết nối DB
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Lỗi kết nối CSDL (Hãy chắc chắn bạn đã cài PostgreSQL và tạo bảng):', err.stack);
  }
  console.log('Đã kết nối thành công tới Database PostgreSQL!');
  release();
});

// ==========================================
// API: Nhận dữ liệu cập nhật từ giao diện và Lưu vào Database
// ==========================================
app.post('/api/save-feature', async (req, res) => {
    const { id, properties, geometry } = req.body;
    try {
        // Lệnh UPSERT: Nếu thửa đất đã tồn tại (trùng id) thì cập nhật, chưa có thì thêm mới
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
        
        // Đóng gói lại thành chuẩn GeoJSON
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Máy chủ WebGIS đang chạy tại: http://localhost:${PORT}`);
    console.log(`=========================================`);
});
