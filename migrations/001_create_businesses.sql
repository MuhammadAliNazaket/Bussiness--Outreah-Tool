CREATE TABLE IF NOT EXISTS businesses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    rating DECIMAL(3, 2),
    status VARCHAR(100),
    website TEXT,
    phone VARCHAR(100),
    facebook TEXT,
    instagram TEXT,
    whatsapp TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
