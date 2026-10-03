const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Tăng limit để upload file lớn

app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-HOST.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) return console.error('Lỗi kết nối CSDL:', err.stack);
  console.log('Đã kết nối thành công tới Database PostgreSQL (Neon)!');
  release();
});

// API: Lưu từng thửa đất (Chỉnh sửa)
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

// API MỚI: Upload toàn bộ file GeoJSON vào Database
app.post('/api/upload-features', async (req, res) => {
    const features = req.body.features;
    if (!features || !Array.isArray(features)) {
        return res.status(400).json({ error: 'Dữ liệu GeoJSON không hợp lệ' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Dùng Transaction để lưu nhanh hàng loạt
        for (let feature of features) {
            const id = feature.id || 'feat_' + Math.random().toString(36).substr(2, 9);
            const properties = feature.properties || {};
            const geometry = feature.geometry || null;

            const query = `
                INSERT INTO geojson_features (feature_id, properties, geometry, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (feature_id) 
                DO UPDATE SET 
                    properties = EXCLUDED.properties, 
                    geometry = EXCLUDED.geometry,
                    updated_at = CURRENT_TIMESTAMP;
            `;
            await client.query(query, [id, properties, geometry]);
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

// API: Lấy dữ liệu
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Máy chủ WebGIS đang chạy tại PORT: ${PORT}`);
});
