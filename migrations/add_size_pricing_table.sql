-- Create size_pricing table
CREATE TABLE IF NOT EXISTS size_pricing (
    size_pricing_id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    size VARCHAR(20) NOT NULL,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    price DECIMAL(10, 2) NOT NULL,
    CONSTRAINT fk_size_pricing_menu_item 
        FOREIGN KEY (menu_item_id) 
        REFERENCES menu_item(menu_item_id) 
        ON DELETE CASCADE 
        ON UPDATE NO ACTION,
    CONSTRAINT unique_menu_item_size_premium 
        UNIQUE (menu_item_id, size, is_premium)
);

CREATE INDEX idx_size_pricing_menu_item ON size_pricing(menu_item_id);

-- Insert size pricing for entrees (non-premium)
-- Small size (5.4) and Large size (11.4) for all entrees except premium ones
INSERT INTO size_pricing (menu_item_id, size, is_premium, price)
SELECT 
    m.menu_item_id,
    'small',
    false,
    5.40
FROM menu_item m
JOIN category c ON m.category_id = c.category_id
WHERE c.name = 'Entrees' 
  AND m.name NOT ILIKE '%Premium%'
  AND m.is_active = true;

INSERT INTO size_pricing (menu_item_id, size, is_premium, price)
SELECT 
    m.menu_item_id,
    'large',
    false,
    11.40
FROM menu_item m
JOIN category c ON m.category_id = c.category_id
WHERE c.name = 'Entrees' 
  AND m.name NOT ILIKE '%Premium%'
  AND m.is_active = true;

-- Insert size pricing for premium entrees
-- Small size (6.9) and Large size (15.9) for premium entrees
INSERT INTO size_pricing (menu_item_id, size, is_premium, price)
SELECT 
    m.menu_item_id,
    'small',
    true,
    6.90
FROM menu_item m
JOIN category c ON m.category_id = c.category_id
WHERE c.name = 'Entrees' 
  AND m.name ILIKE '%Premium%'
  AND m.is_active = true;

INSERT INTO size_pricing (menu_item_id, size, is_premium, price)
SELECT 
    m.menu_item_id,
    'large',
    true,
    15.90
FROM menu_item m
JOIN category c ON m.category_id = c.category_id
WHERE c.name = 'Entrees' 
  AND m.name ILIKE '%Premium%'
  AND m.is_active = true;

-- Insert size pricing for sides
-- Large size (5.6) for all sides
INSERT INTO size_pricing (menu_item_id, size, is_premium, price)
SELECT 
    m.menu_item_id,
    'large',
    false,
    5.60
FROM menu_item m
JOIN category c ON m.category_id = c.category_id
WHERE c.name = 'Sides' 
  AND m.is_active = true;
