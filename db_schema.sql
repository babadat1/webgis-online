-- 1. TẠO BẢNG MỚI (Dành cho CSDL trống)
CREATE TABLE IF NOT EXISTS geojson_features (
    feature_id VARCHAR(100) PRIMARY KEY,
    properties JSONB,
    geometry JSONB,
    project_name VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. THÊM CỘT DỰ ÁN VÀO BẢNG CŨ (Nếu bạn đang dùng CSDL cũ, lệnh này sẽ cập nhật nó mà không mất dữ liệu)
ALTER TABLE geojson_features 
ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
