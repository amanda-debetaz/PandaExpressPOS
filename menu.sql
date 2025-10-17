-- menu items and options

BEGIN;

-- categories
INSERT INTO category(name, display_order) VALUES
  ('Combos', 1), ('Appetizers', 2), ('Entrees', 3), ('Sides', 4)
ON CONFLICT (name) DO NOTHING;

-- menu items (combos / apps / entrees / sides)
WITH c AS (SELECT category_id, name FROM category)
INSERT INTO menu_item(name, price, category_id, is_active) VALUES
  -- combos
  ('Bowl', 10.20, (SELECT category_id FROM c WHERE name='Combos'), TRUE),
  ('Plate', 12.15, (SELECT category_id FROM c WHERE name='Combos'), TRUE),
  ('Bigger Plate', 14.05, (SELECT category_id FROM c WHERE name='Combos'), TRUE),

  -- appetizers
  ('Crab Rangoon (6)', 3.95, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),
  ('Fried Wontons (6)', 3.95, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),
  ('Pork Egg Roll', 2.95, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),
  ('Chicken Egg Roll', 2.95, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),
  ('Veggie Spring Roll', 2.65, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),
  ('Cream Cheese Rangoon', 2.65, (SELECT category_id FROM c WHERE name='Appetizers'), TRUE),

  -- entrees
  ('Honey Walnut Shrimp',         7.95, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Black Pepper Sirloin Steak',  7.95, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Mushroom Chicken',            6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Kung Pao Chicken',            6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('String Bean Chicken Breast',  6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('The Original Orange Chicken', 6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Honey Sesame Chicken Breast', 6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Grilled Teriyaki Chicken',    6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Broccoli Beef',               6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Beijing Beef',                6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),
  ('Black Pepper Chicken',        6.50, (SELECT category_id FROM c WHERE name='Entrees'), TRUE),

  -- sides
  ('White Steamed Rice', 5.55, (SELECT category_id FROM c WHERE name='Sides'), TRUE),
  ('Fried Rice',         5.55, (SELECT category_id FROM c WHERE name='Sides'), TRUE),
  ('Chow Mein',          5.55, (SELECT category_id FROM c WHERE name='Sides'), TRUE),
  ('Super Greens',       5.55, (SELECT category_id FROM c WHERE name='Sides'), TRUE)
ON CONFLICT (name) DO NOTHING;

-- entrée version of Super Greens too
INSERT INTO menu_item(name, price, category_id, is_active)
SELECT 'Super Greens (Entree)', 6.50, category_id, TRUE
FROM category WHERE name='Entrees'
ON CONFLICT (name) DO NOTHING;

-- option groups per combo
INSERT INTO option_group(name, min_select, max_select) VALUES
  ('Choose Side', 1, 2),
  ('Choose Entrees (1)', 0, 1),
  ('Choose Entrees (2)', 0, 2),
  ('Choose Entrees (3)', 0, 3)
ON CONFLICT (name) DO NOTHING;

-- link menu items ↔ option groups, many-to-many
WITH items AS (SELECT name, menu_item_id FROM menu_item),
     og AS (SELECT name, option_group_id FROM option_group)
INSERT INTO menu_item_option_group(menu_item_id, option_group_id) VALUES
  ((SELECT menu_item_id FROM items WHERE name='Bowl'),        (SELECT option_group_id FROM og WHERE name='Choose Side')),
  ((SELECT menu_item_id FROM items WHERE name='Bowl'),        (SELECT option_group_id FROM og WHERE name='Choose Entrees (1)')),
  ((SELECT menu_item_id FROM items WHERE name='Plate'),       (SELECT option_group_id FROM og WHERE name='Choose Side')),
  ((SELECT menu_item_id FROM items WHERE name='Plate'),       (SELECT option_group_id FROM og WHERE name='Choose Entrees (2)')),
  ((SELECT menu_item_id FROM items WHERE name='Bigger Plate'),(SELECT option_group_id FROM og WHERE name='Choose Side')),
  ((SELECT menu_item_id FROM items WHERE name='Bigger Plate'),(SELECT option_group_id FROM og WHERE name='Choose Entrees (3)'))
ON CONFLICT DO NOTHING;

-- "Choose Side" options come from the side items
WITH og AS (
  SELECT option_group_id FROM option_group WHERE name='Choose Side'
),
sides AS (
  SELECT menu_item_id, name
  FROM menu_item
  WHERE name IN ('Chow Mein','Fried Rice','White Steamed Rice','Super Greens')
)
INSERT INTO "option"(option_group_id, name, price_delta, menu_item_id)
SELECT og.option_group_id, sides.name, 0.00, sides.menu_item_id
FROM og
CROSS JOIN sides
ON CONFLICT DO NOTHING;

-- Entrée options (premium items get upcharge from pricing_settings)
WITH entrees AS (
  SELECT menu_item_id, name FROM menu_item WHERE name IN (
    'The Original Orange Chicken','Grilled Teriyaki Chicken','Broccoli Beef','Black Pepper Chicken',
    'Kung Pao Chicken','Mushroom Chicken','Super Greens (Entree)','Honey Walnut Shrimp',
    'Black Pepper Sirloin Steak','String Bean Chicken Breast','Honey Sesame Chicken Breast','Beijing Beef'
  )
)
INSERT INTO "option"(option_group_id, name, price_delta, menu_item_id)
SELECT og.option_group_id,
       e.name,
       CASE WHEN e.name IN ('Honey Walnut Shrimp','Black Pepper Sirloin Steak')
            THEN (SELECT value FROM pricing_settings WHERE key='premium_entree_upcharge')
            ELSE 0.00 END,
       e.menu_item_id
FROM entrees e
CROSS JOIN LATERAL (
  SELECT option_group_id
  FROM option_group
  WHERE name IN ('Choose Entrees (1)','Choose Entrees (2)','Choose Entrees (3)')
) AS og
ON CONFLICT DO NOTHING;

COMMIT;
