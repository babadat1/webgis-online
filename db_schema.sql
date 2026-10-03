-- Chạy đoạn lệnh này trong PostgreSQL (hoặc pgAdmin) để tạo bảng dữ liệu

CREATE TABLE IF NOT EXISTS geojson_features (
    feature_id VARCHAR(100) PRIMARY KEY,
    properties JSONB,
    geometry JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
