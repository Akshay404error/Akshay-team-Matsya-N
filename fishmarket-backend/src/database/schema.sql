-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create custom types
CREATE TYPE user_role AS ENUM ('fisherman', 'buyer', 'admin');
CREATE TYPE fish_quality AS ENUM ('premium', 'standard', 'economy');
CREATE TYPE fish_unit AS ENUM ('kg', 'piece', 'box');
CREATE TYPE fish_status AS ENUM ('available', 'sold', 'reserved');
CREATE TYPE auction_status AS ENUM ('pending', 'active', 'completed', 'cancelled');
CREATE TYPE bid_status AS ENUM ('active', 'outbid', 'winning');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Markets table
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    description TEXT,
    operating_hours JSONB,
    facilities TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fish table
CREATE TABLE fish (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fisherman_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    species VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    unit fish_unit NOT NULL,
    quality fish_quality NOT NULL,
    description TEXT,
    min_price DECIMAL(10,2) CHECK (min_price >= 0),
    catch_date DATE NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    images JSONB,
    status fish_status DEFAULT 'available',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auctions table
CREATE TABLE auctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fish_id UUID NOT NULL REFERENCES fish(id) ON DELETE CASCADE,
    auctioneer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    starting_price DECIMAL(10,2) NOT NULL CHECK (starting_price > 0),
    current_price DECIMAL(10,2) NOT NULL CHECK (current_price >= starting_price),
    reserve_price DECIMAL(10,2),
    bid_increment DECIMAL(10,2) DEFAULT 10.00,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status auction_status DEFAULT 'pending',
    winner_id UUID REFERENCES users(id),
    total_bids INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_times CHECK (end_time > start_time),
    CONSTRAINT check_reserve CHECK (reserve_price IS NULL OR reserve_price >= starting_price)
);

-- Bids table
CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    bidder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    status bid_status DEFAULT 'active',
    is_auto_bid BOOLEAN DEFAULT false,
    max_auto_bid DECIMAL(10,2),
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fish favorites table (many-to-many)
CREATE TABLE fish_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fish_id UUID NOT NULL REFERENCES fish(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, fish_id)
);

-- Auction watchers table (many-to-many)
CREATE TABLE auction_watchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, auction_id)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    commission DECIMAL(10,2) DEFAULT 0,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_markets_location ON markets USING GIST(location);
CREATE INDEX idx_markets_active ON markets(is_active);

CREATE INDEX idx_fish_fisherman ON fish(fisherman_id);
CREATE INDEX idx_fish_market ON fish(market_id);
CREATE INDEX idx_fish_species ON fish(species);
CREATE INDEX idx_fish_quality ON fish(quality);
CREATE INDEX idx_fish_status ON fish(status);
CREATE INDEX idx_fish_active ON fish(is_active);
CREATE INDEX idx_fish_location ON fish USING GIST(location);
CREATE INDEX idx_fish_catch_date ON fish(catch_date);
CREATE INDEX idx_fish_created_at ON fish(created_at);

CREATE INDEX idx_auctions_fish ON auctions(fish_id);
CREATE INDEX idx_auctions_auctioneer ON auctions(auctioneer_id);
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_auctions_start_time ON auctions(start_time);
CREATE INDEX idx_auctions_end_time ON auctions(end_time);
CREATE INDEX idx_auctions_winner ON auctions(winner_id);

CREATE INDEX idx_bids_auction ON bids(auction_id);
CREATE INDEX idx_bids_bidder ON bids(bidder_id);
CREATE INDEX idx_bids_amount ON bids(amount);
CREATE INDEX idx_bids_placed_at ON bids(placed_at);
CREATE INDEX idx_bids_status ON bids(status);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_fish_favorites_user ON fish_favorites(user_id);
CREATE INDEX idx_fish_favorites_fish ON fish_favorites(fish_id);

CREATE INDEX idx_auction_watchers_user ON auction_watchers(user_id);
CREATE INDEX idx_auction_watchers_auction ON auction_watchers(auction_id);

CREATE INDEX idx_transactions_auction ON transactions(auction_id);
CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller ON transactions(seller_id);
CREATE INDEX idx_transactions_status ON transactions(payment_status);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON markets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fish_updated_at BEFORE UPDATE ON fish
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auctions_updated_at BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update auction current price
CREATE OR REPLACE FUNCTION update_auction_current_price()
RETURNS TRIGGER AS $
BEGIN
    UPDATE auctions 
    SET current_price = NEW.amount,
        total_bids = total_bids + 1,
        updated_at = NOW()
    WHERE id = NEW.auction_id;
    
    -- Mark previous bids as outbid
    UPDATE bids 
    SET status = 'outbid' 
    WHERE auction_id = NEW.auction_id 
    AND id != NEW.id 
    AND status = 'active';
    
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER trigger_update_auction_price AFTER INSERT ON bids
    FOR EACH ROW EXECUTE FUNCTION update_auction_current_price();

-- Function to automatically end auctions
CREATE OR REPLACE FUNCTION check_auction_end()
RETURNS TRIGGER AS $
BEGIN
    -- Check if auction should end
    IF NEW.end_time <= NOW() AND OLD.status = 'active' THEN
        -- Find winning bid
        SELECT bidder_id INTO NEW.winner_id
        FROM bids
        WHERE auction_id = NEW.id
        AND status = 'active'
        ORDER BY amount DESC, placed_at ASC
        LIMIT 1;
        
        -- Update status
        NEW.status = 'completed';
        
        -- Mark winning bid
        IF NEW.winner_id IS NOT NULL THEN
            UPDATE bids 
            SET status = 'winning' 
            WHERE auction_id = NEW.id 
            AND bidder_id = NEW.winner_id 
            AND status = 'active';
            
            -- Update fish status
            UPDATE fish 
            SET status = 'sold' 
            WHERE id = (SELECT fish_id FROM auctions WHERE id = NEW.id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER trigger_check_auction_end BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION check_auction_end();

-- Insert sample data
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone) VALUES
(uuid_generate_v4(), 'admin@fishmarket.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewxBEzpW4mKPjR8W', 'Admin', 'User', 'admin', '+1234567890'),
(uuid_generate_v4(), 'fisherman1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewxBEzpW4mKPjR8W', 'John', 'Fisher', 'fisherman', '+1234567891'),
(uuid_generate_v4(), 'buyer1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewxBEzpW4mKPjR8W', 'Jane', 'Buyer', 'buyer', '+1234567892');

-- Insert sample markets
INSERT INTO markets (id, name, address, location, phone, operating_hours) VALUES
(uuid_generate_v4(), 'Mumbai Fish Market', 'Sassoon Docks, Mumbai, Maharashtra 400005', ST_SetSRID(ST_MakePoint(72.8311, 18.9504), 4326), '+912212345678', '{"monday": "04:00-14:00", "tuesday": "04:00-14:00", "wednesday": "04:00-14:00", "thursday": "04:00-14:00", "friday": "04:00-14:00", "saturday": "04:00-14:00", "sunday": "closed"}'),
(uuid_generate_v4(), 'Kochi Fish Market', 'Marine Drive, Kochi, Kerala 682031', ST_SetSRID(ST_MakePoint(76.2673, 9.9312), 4326), '+914842345679', '{"monday": "05:00-15:00", "tuesday": "05:00-15:00", "wednesday": "05:00-15:00", "thursday": "05:00-15:00", "friday": "05:00-15:00", "saturday": "05:00-15:00", "sunday": "05:00-12:00"}'),
(uuid_generate_v4(), 'Chennai Fish Market', 'Kasimedu, Chennai, Tamil Nadu 600021', ST_SetSRID(ST_MakePoint(80.2707, 13.0827), 4326), '+914423456780', '{"monday": "04:30-13:30", "tuesday": "04:30-13:30", "wednesday": "04:30-13:30", "thursday": "04:30-13:30", "friday": "04:30-13:30", "saturday": "04:30-13:30", "sunday": "closed"}');