-- Migration: 001_create_users_table.sql
-- Description: Create users table with role-based access control
-- Created: 2024

-- Create ENUM types for user roles and KYC status
CREATE TYPE user_role AS ENUM (
    'fisher',
    'society_admin', 
    'buyer',
    'delivery_partner',
    'super_admin'
);

CREATE TYPE kyc_status AS ENUM (
    'pending',
    'under_review',
    'approved',
    'rejected'
);

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role user_role NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255), -- Nullable for OTP-only authentication
    society_id INTEGER, -- References societies table (created later)
    kyc_status kyc_status DEFAULT 'pending',
    is_active BOOLEAN DEFAULT true,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_phone ON users(phone) WHERE is_active = true;
CREATE INDEX idx_users_email ON users(email) WHERE is_active = true AND email IS NOT NULL;
CREATE INDEX idx_users_role ON users(role) WHERE is_active = true;
CREATE INDEX idx_users_society_id ON users(society_id) WHERE society_id IS NOT NULL AND is_active = true;
CREATE INDEX idx_users_kyc_status ON users(kyc_status) WHERE is_active = true;
CREATE INDEX idx_users_created_at ON users(created_at);

-- Add constraints
ALTER TABLE users ADD CONSTRAINT chk_users_phone_format 
    CHECK (phone ~ '^[+][0-9]{1,4}[0-9]{6,14}$'); -- International phone format

ALTER TABLE users ADD CONSTRAINT chk_users_email_format 
    CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE users IS 'Main users table supporting multiple roles in the fish market platform';
COMMENT ON COLUMN users.id IS 'Primary key, auto-incrementing user ID';
COMMENT ON COLUMN users.role IS 'User role determining access permissions';
COMMENT ON COLUMN users.phone IS 'Unique phone number in international format for OTP authentication';
COMMENT ON COLUMN users.email IS 'Optional email address for notifications';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password, nullable for OTP-only auth';
COMMENT ON COLUMN users.society_id IS 'Reference to society for fishers and society admins';
COMMENT ON COLUMN users.kyc_status IS 'KYC verification status';
COMMENT ON COLUMN users.is_active IS 'Soft delete flag';

-- Insert default super admin user (change credentials in production!)
INSERT INTO users (role, name, phone, email, password_hash, kyc_status, is_active) 
VALUES (
    'super_admin', 
    'System Administrator', 
    '+919999999999', 
    'admin@fishmarket.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBMKFn64Ee3K1u', -- 'admin123' - CHANGE THIS!
    'approved',
    true
);

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Users table created successfully with indexes and constraints';
    RAISE NOTICE 'Default admin user created with phone: +919999999999';
    RAISE NOTICE 'IMPORTANT: Change default admin credentials in production!';
END $$;