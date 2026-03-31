-- Add missing columns to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 5;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0;

-- Set default values for existing rows
UPDATE inventory_items SET category = 'General' WHERE category IS NULL;
UPDATE inventory_items SET min_stock_level = 5 WHERE min_stock_level IS NULL;
UPDATE inventory_items SET unit_cost = 0 WHERE unit_cost IS NULL;
UPDATE inventory_items SET unit_price = 0 WHERE unit_price IS NULL;
