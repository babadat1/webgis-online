const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
// Tăng tối đa dung lượng nhận file để không bị chặn
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// ==============================================================
// ⚠️ QUAN TRỌNG: BẠN PHẢI DÁN LINK NEON VÀO ĐÂY TRƯỚC KHI UP CODE
// ==============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gMTNKqx9r2Gu@ep-delicate-meadow-b373h7eq-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) return console.error('Lỗi kết nối CSDL (Sai link hoặc mạng lỗi):', err.stack);
  console.log('Đã kết nối thành công tới Database PostgreSQL (Neon)!');
  release();
});

// API: Lưu từng thửa đất khi chỉnh sửa trên Sidebar
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
        res.status(500).json({ success: false, error: err.message });
    }
});

// API MỚI: Tối ưu hóa Upload file khổng lồ (Chống sập RAM Render)
app.post('/api/upload-features', async (req, res) => {
    const features = req.body.features;
    if (!features || !Array.isArray(features)) {
        return res.status(400).json({ error: 'Dữ liệu GeoJSON không hợp lệ' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Băm dữ liệu ra thành từng block nhỏ (50 thửa 1 lần) để chống sập RAM
        const chunkSize = 50; 
        for (let i = 0; i < features.length; i += chunkSize) {
            const chunk = features.slice(i, i + chunkSize);
            
            // Xử lý song song 50 thửa
            const promises = chunk.map(feature => {
                const id = feature.id || 'feat_' + Math.random().toString(36).substr(2, 9);
                const properties = feature.properties || {};
                const geometry = feature.geometry || null;

                const query = `
                    INSERT INTO geojson_features (feature_id, properties, geometry, updated_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT (feature_id) 
                    DO UPDATE SET properties = EXCLUDED.properties, geometry = EXCLUDED.geometry, updated_at = CURRENT_TIMESTAMP;
                `;
                return client.query(query, [id, properties, geometry]);
            });
            
            await Promise.all(promises);
            console.log(`Đã xử lý xong: ${i + chunk.length} / ${features.length} thửa...`);
        }
        
        await client.query('COMMIT');
        res.json({ success: true, message: `Đã lưu thành công ${features.length} thửa đất lên Server!` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Lỗi upload file DB:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// API: Lấy dữ liệu tải về Web
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
        res.status(500).json({ error: err.message });
    }
});


// API: Xác thực đăng nhập (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // Tài khoản Admin: Có toàn quyền Sửa/Xóa/Thêm
    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, role: 'admin', message: 'Đăng nhập Admin thành công!' });
    } 
    // Tài khoản Khách: Chỉ được Xem bản đồ và Báo cáo
    else if (username === 'khach' && password === 'khach123') {
        return res.json({ success: true, role: 'guest', message: 'Đăng nhập Khách thành công!' });
    } 
    else {
        return res.status(401).json({ success: false, message: 'Sai tên tài khoản hoặc mật khẩu!' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Máy chủ WebGIS đang chạy tại PORT: ${PORT}`);
});
