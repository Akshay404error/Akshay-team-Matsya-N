-- Migration: 004_create_catches_table.sql
-- Description: Create catches table with PostGIS geometry support for fisher catch logging
-- Created: 2024

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create ENUM types for catch-related fields
CREATE TYPE catch_status AS ENUM (
    'logged',           -- Fisher logged the catch
    'qc_pending',       -- Waiting for society QC
    'qc_approved',      -- Approved by society
    'qc_rejected',      -- Rejected by society
    'lotted',          -- Converted to auction lot
    'sold',            -- Successfully sold
    'expired',         -- Past freshness window
    'deleted'          -- Soft deleted
);

CREATE TYPE fish_grade AS ENUM (
    'premium',
    'grade_a',
    'grade_b', 
    'grade_c',
    'mixed'
);

-- Create catches table with PostGIS support
CREATE TABLE catches (
    id SERIAL PRIMARY KEY,
    fisher_id INTEGER NOT NULL,
    species VARCHAR(100) NOT NULL,
    grade fish_grade NOT NULL,
    gross_weight_kg DECIMAL(10,2) NOT NULL CHECK (gross_weight_kg > 0),
    media_urls JSONB DEFAULT '[]'::jsonb, -- Array of image/video URLs
    landed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- PostGIS geometry column for GPS location (lat, lon in WGS84)
    geom GEOMETRY(Point, 4326) NOT NULL,
    
    -- Cold chain and handling information
    cold_chain JSONB DEFAULT '{}'::jsonb,
    
    -- Status tracking
    status catch_status DEFAULT 'logged',
    
    -- Additional catch details
    landing_center VARCHAR(255),
    boat_id VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint (will be added after users table exists)
    CONSTRAINT fk_catches_fisher FOREIGN KEY (fisher_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Create spatial indexes for PostGIS queries
CREATE INDEX idx_catches_geom ON catches USING GIST(geom);
CREATE INDEX idx_catches_geom_landing_time ON catches USING GIST(geom, landed_at);

-- Create regular indexes for performance
CREATE INDEX idx_catches_fisher_id ON catches(fisher_id);
CREATE INDEX idx_catches_status ON catches(status);
CREATE INDEX idx_catches_species ON catches(species);
CREATE INDEX idx_catches_grade ON catches(grade);
CREATE INDEX idx_catches_landed_at ON catches(landed_at DESC);
CREATE INDEX idx_catches_created_at ON catches(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_catches_species_grade_status ON catches(species, grade, status);
CREATE INDEX idx_catches_fisher_status_landed ON catches(fisher_id, status, landed_at DESC);
CREATE INDEX idx_catches_status_landed ON catches(status, landed_at DESC) WHERE status IN ('qc_approved', 'logged');

-- Partial indexes for active catches
CREATE INDEX idx_catches_active_geom ON catches USING GIST(geom) WHERE status NOT IN ('expired', 'deleted', 'sold');
CREATE INDEX idx_catches_qc_pending ON catches(fisher_id, landed_at) WHERE status = 'qc_pending';
CREATE INDEX idx_catches_available_for_sale ON catches(species, grade, landed_at DESC) WHERE status = 'qc_approved';

-- GIN index for JSONB fields
CREATE INDEX idx_catches_media_urls ON catches USING GIN(media_urls);
CREATE INDEX idx_catches_cold_chain ON catches USING GIN(cold_chain);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_catches_updated_at 
    BEFORE UPDATE ON catches 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE catches ADD CONSTRAINT chk_catches_species_not_empty 
    CHECK (LENGTH(TRIM(species)) > 0);

ALTER TABLE catches ADD CONSTRAINT chk_catches_valid_coordinates
    CHECK (ST_X(geom) BETWEEN -180 AND 180 AND ST_Y(geom) BETWEEN -90 AND 90);

-- Constraint for reasonable catch weights (0.1kg to 10,000kg)
ALTER TABLE catches ADD CONSTRAINT chk_catches_reasonable_weight
    CHECK (gross_weight_kg BETWEEN 0.1 AND 10000.0);

-- Ensure landed_at is not in the future
ALTER TABLE catches ADD CONSTRAINT chk_catches_landed_at_not_future
    CHECK (landed_at <= NOW() + INTERVAL '1 hour'); -- Allow 1 hour buffer for timezone issues

-- Add comments for documentation
COMMENT ON TABLE catches IS 'Fisher catch logs with GPS location tracking using PostGIS';
COMMENT ON COLUMN catches.id IS 'Primary key, auto-incrementing catch ID';
COMMENT ON COLUMN catches.fisher_id IS 'Foreign key reference to the fisher who logged this catch';
COMMENT ON COLUMN catches.species IS 'Fish species name (standardized)';
COMMENT ON COLUMN catches.grade IS 'Quality grade of the catch';
COMMENT ON COLUMN catches.gross_weight_kg IS 'Total weight of catch in kilograms';
COMMENT ON COLUMN catches.media_urls IS 'JSONB array of image/video URLs for catch documentation';
COMMENT ON COLUMN catches.landed_at IS 'Timestamp when fish was landed at port';
COMMENT ON COLUMN catches.geom IS 'PostGIS Point geometry storing GPS coordinates (WGS84)';
COMMENT ON COLUMN catches.cold_chain IS 'JSONB object storing cold chain temperature and handling data';
COMMENT ON COLUMN catches.status IS 'Current processing status of the catch';
COMMENT ON COLUMN catches.landing_center IS 'Name/ID of the landing center where catch was brought';
COMMENT ON COLUMN catches.boat_id IS 'Identifier of the fishing boat/vessel';

-- Create function to get catches within radius
CREATE OR REPLACE FUNCTION get_catches_within_radius(
    center_lat DECIMAL,
    center_lon DECIMAL,
    radius_km DECIMAL,
    max_age_hours INTEGER DEFAULT 24
) RETURNS TABLE (
    id INTEGER,
    fisher_id INTEGER,
    species VARCHAR,
    grade fish_grade,
    gross_weight_kg DECIMAL,
    landed_at TIMESTAMP WITH TIME ZONE,
    latitude DECIMAL,
    longitude DECIMAL,
    distance_km DECIMAL,
    hours_since_landing DECIMAL,
    freshness_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.fisher_id,
        c.species,
        c.grade,
        c.gross_weight_kg,
        c.landed_at,
        ST_Y(c.geom)::DECIMAL as latitude,
        ST_X(c.geom)::DECIMAL as longitude,
        (ST_Distance(c.geom, ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography) / 1000)::DECIMAL as distance_km,
        (EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600)::DECIMAL as hours_since_landing,
        GREATEST(0, (100 - (EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600 / max_age_hours * 100)))::INTEGER as freshness_score
    FROM catches c
    WHERE ST_DWithin(
        c.geom, 
        ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography, 
        radius_km * 1000
    )
    AND c.status = 'qc_approved'
    AND EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600 <= max_age_hours
    ORDER BY distance_km ASC, c.landed_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate freshness score
CREATE OR REPLACE FUNCTION calculate_freshness_score(landed_timestamp TIMESTAMP WITH TIME ZONE, max_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
BEGIN
    RETURN GREATEST(0, (100 - (EXTRACT(EPOCH FROM (NOW() - landed_timestamp)) / 3600 / max_hours * 100)))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-expire old catches (to be called by cron job)
CREATE OR REPLACE FUNCTION expire_old_catches(max_age_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE catches 
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('logged', 'qc_pending', 'qc_approved')
    AND EXTRACT(EPOCH FROM (NOW() - landed_at)) / 3600 > max_age_hours;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log the expiration
    INSERT INTO audit_logs (actor_id, entity, entity_id, action, diff, created_at)
    VALUES (
        NULL, 
        'system', 
        NULL, 
        'auto_expire_catches', 
        json_build_object('expired_count', expired_count, 'max_age_hours', max_age_hours)::jsonb,
        NOW()
    );
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample fish species for reference
INSERT INTO catches (fisher_id, species, grade, gross_weight_kg, landed_at, geom, status, landing_center, boat_id) 
VALUES 
    -- Sample catches (assuming user IDs 2-4 are fishers from previous migration)
    (2, 'tuna', 'premium', 25.50, NOW() - INTERVAL '2 hours', ST_SetSRID(ST_MakePoint(80.2707, 13.0827), 4326), 'qc_approved', 'Chennai Harbor', 'TN-CH-001'),
    (2, 'sardine', 'grade_a', 15.75, NOW() - INTERVAL '4 hours', ST_SetSRID(ST_MakePoint(80.2800, 13.0900), 4326), 'qc_approved', 'Chennai Harbor', 'TN-CH-001'),
    (3, 'mackerel', 'grade_b', 8.25, NOW() - INTERVAL '1 hour', ST_SetSRID(ST_MakePoint(76.2673, 9.9312), 4326), 'qc_pending', 'Kochi Port', 'KL-KC-002')
ON CONFLICT DO NOTHING; -- Ignore if users don't exist yet

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Catches table created successfully with PostGIS support';
    RAISE NOTICE 'Created spatial indexes and functions for location-based queries';
    RAISE NOTICE 'Sample catch data inserted for testing';
END $$;