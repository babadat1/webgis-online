const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gMTNKqx9r2Gu@ep-delicate-meadow-b373h7eq-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS geojson_features (
                feature_id VARCHAR(100) PRIMARY KEY,
                properties JSONB,
                geometry JSONB,
                project_name VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE geojson_features ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);

            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(50) PRIMARY KEY,
                password VARCHAR(100) NOT NULL,
                role VARCHAR(20) NOT NULL
            );
            
            -- Thêm cột permissions (phân quyền chi tiết) nếu chưa có
            ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
        `);

        const res = await pool.query('SELECT COUNT(*) FROM users');
        if (parseInt(res.rows[0].count) === 0) {
            await pool.query("INSERT INTO users (username, password, role, permissions) VALUES ('admin', 'admin123', 'admin', '{"can_upload":true,"can_delete":true,"can_edit":true,"can_export":true}')");
            await pool.query("INSERT INTO users (username, password, role, permissions) VALUES ('khach', 'khach123', 'guest', '{}')");
            console.log("Đã khởi tạo tài khoản mặc định.");
        }
        console.log("Đã kết nối và khởi tạo CSDL thành công!");
    } catch (err) {
        console.error("Lỗi khởi tạo CSDL:", err);
    }
}

initDB();

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ success: true, role: user.role, username: user.username, permissions: user.permissions || {}, message: 'Đăng nhập thành công!' });
        } else {
            res.status(401).json({ success: false, message: 'Sai tên tài khoản hoặc mật khẩu!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, password, role, permissions FROM users');
        res.json({ success: true, users: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Gộp tạo mới và cập nhật user
app.post('/api/save-user', async (req, res) => {
    const { mode, oldUsername, newUsername, newPassword, role, permissions } = req.body;
    try {
        if (mode === 'create') {
            const check = await pool.query('SELECT * FROM users WHERE username = $1', [newUsername]);
            if (check.rows.length > 0) {
                return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });
            }
            await pool.query('INSERT INTO users (username, password, role, permissions) VALUES ($1, $2, $3, $4)', 
                [newUsername, newPassword, role || 'guest', permissions]);
            res.json({ success: true, message: 'Đã tạo tài khoản mới thành công!' });
            
        } else if (mode === 'update') {
            if (oldUsername !== newUsername) {
                const check = await pool.query('SELECT * FROM users WHERE username = $1', [newUsername]);
                if (check.rows.length > 0) {
                    return res.status(400).json({ success: false, message: 'Tên tài khoản mới đã tồn tại!' });
                }
            }
            await pool.query('UPDATE users SET username = $1, password = $2, permissions = $3 WHERE username = $4', 
                [newUsername, newPassword, permissions, oldUsername]);
            res.json({ success: true, message: 'Cập nhật tài khoản thành công!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/delete-user/:username', async (req, res) => {
    const username = req.params.username;
    if (username === 'admin') return res.status(400).json({ success: false, message: 'Tuyệt đối không thể xóa tài khoản admin gốc!' });
    try {
        await pool.query("DELETE FROM users WHERE username = $1", [username]);
        res.json({ success: true, message: 'Đã xóa tài khoản thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Các endpoint dự án giữ nguyên
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query("SELECT DISTINCT COALESCE(project_name, 'Dự án Mặc định') as project_name FROM geojson_features ORDER BY project_name ASC");
        res.json({ success: true, projects: result.rows.map(r => r.project_name) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/delete-project/:projectName', async (req, res) => {
    const projectName = req.params.projectName;
    try {
        await pool.query("DELETE FROM geojson_features WHERE project_name = $1 OR (project_name IS NULL AND $1 = 'Dự án Mặc định')", [projectName]);
        res.json({ success: true, message: 'Đã xóa dự án thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/save-feature', async (req, res) => {
    const { id, properties, geometry, projectName } = req.body;
    const pName = projectName || 'Dự án Mặc định';
    try {
        const query = `
            INSERT INTO geojson_features (feature_id, properties, geometry, project_name, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (feature_id) 
            DO UPDATE SET properties = EXCLUDED.properties, geometry = EXCLUDED.geometry, project_name = EXCLUDED.project_name, updated_at = CURRENT_TIMESTAMP;
        `;
        await pool.query(query, [id, properties, geometry, pName]);
        res.json({ success: true, message: 'Đã lưu sửa đổi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/upload-features', async (req, res) => {
    const { features, projectName } = req.body;
    if (!features || !Array.isArray(features)) return res.status(400).json({ error: 'Dữ liệu GeoJSON không hợp lệ' });
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

app.get('/api/get-features', async (req, res) => {
    const projectName = req.query.project;
    try {
        let result;
        if(projectName) {
            if (projectName === 'Dự án Mặc định') {
                result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features WHERE project_name = $1 OR project_name IS NULL', [projectName]);
            } else {
                result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features WHERE project_name = $1', [projectName]);
            }
        } else {
            result = await pool.query('SELECT feature_id, properties, geometry FROM geojson_features LIMIT 0');
        }
        const geojson = { type: "FeatureCollection", features: result.rows.map(row => ({ type: "Feature", id: row.feature_id, properties: row.properties, geometry: row.geometry })) };
        res.json(geojson);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Máy chủ WebGIS đang chạy tại PORT: ${PORT}`);
});
