const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Cấu hình Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gMTNKqx9r2Gu@ep-delicate-meadow-b373h7eq-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) return console.error('Lỗi kết nối CSDL:', err.stack);
  console.log('Đã kết nối thành công tới Database PostgreSQL!');
  release();
});

// API: Lấy danh sách các Dự án hiện có
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT project_name FROM geojson_features WHERE project_name IS NOT NULL AND project_name != $1 ORDER BY project_name ASC', ['']);
        res.json({ success: true, projects: result.rows.map(r => r.project_name) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Xóa toàn bộ 1 dự án
app.delete('/api/delete-project/:projectName', async (req, res) => {
    const projectName = req.params.projectName;
    try {
        await pool.query('DELETE FROM geojson_features WHERE project_name = $1', [projectName]);
        res.json({ success: true, message: 'Đã xóa dự án thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Lưu từng thửa đất khi chỉnh sửa
app.post('/api/save-feature', async (req, res) => {
    const { id, properties, geometry, projectName } = req.body;
    try {
        const query = `
            INSERT INTO geojson_features (feature_id, properties, geometry, project_name, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (feature_id) 
            DO UPDATE SET 
                properties = EXCLUDED.properties, 
                geometry = EXCLUDED.geometry,
                project_name = EXCLUDED.project_name,
                updated_at = CURRENT_TIMESTAMP;
        `;
        await pool.query(query, [id, properties, geometry, projectName]);
        res.json({ success: true, message: 'Đã lưu sửa đổi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Upload nguyên file GeoJSON
app.post('/api/upload-features', async (req, res) => {
    const { features, projectName } = req.body;
    if (!features || !Array.isArray(features)) {
        return res.status(400).json({ error: 'Dữ liệu GeoJSON không hợp lệ' });
    }
    const pName = projectName || 'Dự án Mặc định';
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        const chunkSize = 50; 
        for (let i = 0; i < features.length; i += chunkSize) {
            const chunk = features.slice(i, i + chunkSize);
            const promises = chunk.map(feature => {
                const id = feature.id || 'feat_' + Math.random().toString(36).substr(2, 9);
                const properties = feature.properties || {};
                const geometry = feature.geometry || null;
                const query = `
                    INSERT INTO geojson_features (feature_id, properties, geometry, project_name, updated_at)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                    ON CONFLICT (feature_id) 
                    DO UPDATE SET properties = EXCLUDED.properties, geometry = EXCLUDED.geometry, project_name = EXCLUDED.project_name, updated_at = CURRENT_TIMESTAMP;
                `;
                return client.query(query, [id, properties, geometry, pName]);
            });
            await Promise.all(promises);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: `Đã lưu thành công dự án [${pName}]!` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// API: Lấy dữ liệu của 1 dự án
app.get('/api/get-features', async (req, res) => {
    const projectName = req.query.project;
    try {
        let result;
        if(projectName) {
            result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features WHERE project_name = $1', [projectName]);
        } else {
            result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features LIMIT 0'); // Trả về rỗng nếu không chọn dự án
        }
        
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
