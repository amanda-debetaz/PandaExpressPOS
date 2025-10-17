BEGIN;

-- inventory seed (units normalized to g / pcs)
INSERT INTO inventory(name, unit, servings_per_unit, par_level, reorder_point, cost_per_unit, lead_time_days, is_perishable, shelf_life_days, allergen_info) VALUES
  ('Chicken Breast (diced)','g',1,40000,16000,0.0100,3,TRUE,6,''),
  ('Chicken Thigh (diced)','g',1,60000,25000,0.0080,3,TRUE,6,''),
  ('Beef Slices','g',1,50000,20000,0.0120,5,TRUE,6,''),
  ('Sirloin Steak (sliced)','g',1,50000,20000,0.0135,5,TRUE,6,''),
  ('Shrimp (peeled)','g',1,30000,15000,0.0290,5,TRUE,6,'shellfish'),
  ('String Beans','g',1,20000,8000,0.0020,2,TRUE,10,''),
  ('Broccoli Florets','g',1,30000,12000,0.0030,2,TRUE,6,''),
  ('White Onion','g',1,40000,15000,0.0010,2,TRUE,20,''),
  ('Bell Pepper Red','g',1,20000,8000,0.0024,2,TRUE,12,''),
  ('Cabbage','g',1,40000,15000,0.0013,2,TRUE,15,''),
  ('Kale','g',1,16000,6000,0.0019,2,TRUE,10,''),
  ('Chow Mein Noodles','g',1,30000,12000,0.0013,3,TRUE,60,'gluten'),
  ('Long Grain Rice','g',1,50000,20000,0.0007,3,FALSE,365,''),
  ('Liquid Egg','g',1,12000,5000,0.0031,2,TRUE,14,'eggs'),
  ('Peas & Carrots','g',1,16000,6000,0.0016,2,TRUE,10,''),
  ('#1 Sauce Base','g',1,20000,8000,0.0040,7,FALSE,365,'soy,gluten'),
  ('Orange Sauce','g',1,20000,8000,0.0041,7,FALSE,365,'soy,gluten'),
  ('Teriyaki Sauce','g',1,18000,7000,0.0038,7,FALSE,365,'soy,gluten'),
  ('#4 Veg Sauce','g',1,16000,6000,0.0036,7,FALSE,365,'soy,gluten'),
  ('#5 Beef Sauce','g',1,16000,6000,0.0036,7,FALSE,365,'soy,gluten'),
  ('#6 Beijing Beef Sauce','g',1,16000,6000,0.0038,7,FALSE,365,'soy,gluten'),
  ('Black Pepper Steak Sauce','g',1,16000,6000,0.0039,7,FALSE,365,'soy,gluten'),
  ('Walnuts (candied)','g',1,2000,800,0.0120,7,FALSE,365,'tree_nuts'),
  ('Peanuts (roasted)','g',1,2000,800,0.0090,7,FALSE,365,'peanuts'),
  ('Sesame Seeds','g',1,2000,800,0.0080,7,FALSE,365,'sesame'),
  ('Napkins','pcs',1,1000,400,0.0160,3,FALSE,3650,''),
  ('Forks (Plastic)','pcs',1,600,200,0.0360,4,FALSE,3650,''),
  ('Spoons (Plastic)','pcs',1,400,150,0.0360,4,FALSE,3650,''),
  ('Chopsticks (pairs)','pcs',1,300,120,0.0530,4,FALSE,3650,''),
  ('Straws','pcs',1,500,200,0.0240,4,FALSE,3650,''),
  ('Cup 16oz','pcs',1,400,150,0.1200,5,FALSE,3650,''),
  ('Cup 24oz','pcs',1,400,150,0.1400,5,FALSE,3650,''),
  ('Cup Lid 16/24oz','pcs',1,400,150,0.0800,5,FALSE,3650,''),
  ('To-Go Box (Entree)','pcs',1,300,120,0.1500,7,FALSE,3650,''),
  ('To-Go Box (Side)','pcs',1,300,120,0.1330,7,FALSE,3650,''),
  ('Paper Bowls','pcs',1,300,120,0.1400,7,FALSE,3650,''),
  ('Paper Plates','pcs',1,300,120,0.1270,7,FALSE,3650,''),
  ('Cream Cheese Packets','pcs',1,200,80,0.1000,7,FALSE,3650,'milk'),
  ('Sweet & Sour Sauce Pack','pcs',1,250,100,0.0880,7,FALSE,3650,'soy,gluten')
ON CONFLICT (name) DO UPDATE SET
  unit = EXCLUDED.unit,
  servings_per_unit = EXCLUDED.servings_per_unit,
  par_level = EXCLUDED.par_level,
  reorder_point = EXCLUDED.reorder_point,
  cost_per_unit = EXCLUDED.cost_per_unit,
  lead_time_days = EXCLUDED.lead_time_days,
  is_perishable = EXCLUDED.is_perishable,
  shelf_life_days = EXCLUDED.shelf_life_days,
  allergen_info = EXCLUDED.allergen_info;

-- normalize allergen_info (lowercase, dedupe, add wheat when 'gluten')
UPDATE inventory
SET allergen_info = lower(regexp_replace(coalesce(allergen_info,''), '\s*,\s*', ',', 'g'));

UPDATE inventory SET allergen_info = regexp_replace(allergen_info, '(^|,)dairy(,|$)', '\1milk\2', 'g')
WHERE allergen_info ~ '(^|,)dairy(,|$)';

UPDATE inventory SET allergen_info = regexp_replace(allergen_info, '(^|,)egg(,|$)', '\1eggs\2', 'g')
WHERE allergen_info ~ '(^|,)egg(,|$)';

UPDATE inventory SET allergen_info = regexp_replace(allergen_info, '(^|,)tree_nuts?(,|$)', '\1tree_nuts\2', 'g')
WHERE allergen_info ~ 'tree_nut';

UPDATE inventory
SET allergen_info = CASE
  WHEN allergen_info ~ '(^|,)wheat(,|$)' THEN allergen_info
  WHEN btrim(allergen_info) = '' THEN 'wheat'
  ELSE allergen_info || ',wheat'
END
WHERE allergen_info ~ '(^|,)gluten(,|$)';

WITH exploded AS (
  SELECT ingredient_id, unnest(string_to_array(nullif(allergen_info,''), ',')) token
  FROM inventory
), cleaned AS (
  SELECT ingredient_id, string_agg(DISTINCT trim(token), ',' ORDER BY trim(token)) clean
  FROM exploded WHERE coalesce(trim(token),'') <> '' GROUP BY ingredient_id
)
UPDATE inventory i
SET allergen_info = c.clean
FROM cleaned c
WHERE i.ingredient_id = c.ingredient_id;

-- recipes
WITH mi AS (SELECT name, menu_item_id FROM menu_item),
     ing AS (SELECT name, ingredient_id FROM inventory)
INSERT INTO recipe(menu_item_id, ingredient_id, qty_per_item, qty_unit) VALUES
  ((SELECT menu_item_id FROM mi WHERE name='White Steamed Rice'), (SELECT ingredient_id FROM ing WHERE name='Long Grain Rice'), 200, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Fried Rice'),         (SELECT ingredient_id FROM ing WHERE name='Long Grain Rice'), 180, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Fried Rice'),         (SELECT ingredient_id FROM ing WHERE name='Peas & Carrots'),  40, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Fried Rice'),         (SELECT ingredient_id FROM ing WHERE name='Liquid Egg'),      30, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Chow Mein'),          (SELECT ingredient_id FROM ing WHERE name='Chow Mein Noodles'),150,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Chow Mein'),          (SELECT ingredient_id FROM ing WHERE name='Cabbage'),         60, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Chow Mein'),          (SELECT ingredient_id FROM ing WHERE name='White Onion'),     40, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens'),       (SELECT ingredient_id FROM ing WHERE name='Broccoli Florets'),90, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens'),       (SELECT ingredient_id FROM ing WHERE name='Kale'),            50, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens'),       (SELECT ingredient_id FROM ing WHERE name='#4 Veg Sauce'),    30, 'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Walnut Shrimp'),        (SELECT ingredient_id FROM ing WHERE name='Shrimp (peeled)'), 120,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Walnut Shrimp'),        (SELECT ingredient_id FROM ing WHERE name='Walnuts (candied)'),20,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Walnut Shrimp'),        (SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),    40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Sirloin Steak'), (SELECT ingredient_id FROM ing WHERE name='Sirloin Steak (sliced)'),120,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Sirloin Steak'), (SELECT ingredient_id FROM ing WHERE name='Broccoli Florets'), 60,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Sirloin Steak'), (SELECT ingredient_id FROM ing WHERE name='Black Pepper Steak Sauce'),40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Mushroom Chicken'),           (SELECT ingredient_id FROM ing WHERE name='Chicken Thigh (diced)'),130,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Mushroom Chicken'),           (SELECT ingredient_id FROM ing WHERE name='White Onion'),        40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Mushroom Chicken'),           (SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),      40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Kung Pao Chicken'),           (SELECT ingredient_id FROM ing WHERE name='Chicken Thigh (diced)'),130,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Kung Pao Chicken'),           (SELECT ingredient_id FROM ing WHERE name='Peanuts (roasted)'),  10,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Kung Pao Chicken'),           (SELECT ingredient_id FROM ing WHERE name='Bell Pepper Red'),    50,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Kung Pao Chicken'),           (SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),      40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='String Bean Chicken Breast'), (SELECT ingredient_id FROM ing WHERE name='Chicken Breast (diced)'),130,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='String Bean Chicken Breast'), (SELECT ingredient_id FROM ing WHERE name='String Beans'),       70,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='String Bean Chicken Breast'), (SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),      35,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='The Original Orange Chicken'),(SELECT ingredient_id FROM ing WHERE name='Chicken Thigh (diced)'),150,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='The Original Orange Chicken'),(SELECT ingredient_id FROM ing WHERE name='Orange Sauce'),       60,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Sesame Chicken Breast'),(SELECT ingredient_id FROM ing WHERE name='Chicken Breast (diced)'),130,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Sesame Chicken Breast'),(SELECT ingredient_id FROM ing WHERE name='Sesame Seeds'),       6,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Honey Sesame Chicken Breast'),(SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),      40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Grilled Teriyaki Chicken'),   (SELECT ingredient_id FROM ing WHERE name='Chicken Thigh (diced)'),170,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Grilled Teriyaki Chicken'),   (SELECT ingredient_id FROM ing WHERE name='Teriyaki Sauce'),     50,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Broccoli Beef'),              (SELECT ingredient_id FROM ing WHERE name='Beef Slices'),        120,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Broccoli Beef'),              (SELECT ingredient_id FROM ing WHERE name='Broccoli Florets'),   80,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Broccoli Beef'),              (SELECT ingredient_id FROM ing WHERE name='#5 Beef Sauce'),      40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Beijing Beef'),               (SELECT ingredient_id FROM ing WHERE name='Beef Slices'),        120,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Beijing Beef'),               (SELECT ingredient_id FROM ing WHERE name='Bell Pepper Red'),    50,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Beijing Beef'),               (SELECT ingredient_id FROM ing WHERE name='#6 Beijing Beef Sauce'),40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Chicken'),       (SELECT ingredient_id FROM ing WHERE name='Chicken Thigh (diced)'),130,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Chicken'),       (SELECT ingredient_id FROM ing WHERE name='White Onion'),        60,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Black Pepper Chicken'),       (SELECT ingredient_id FROM ing WHERE name='#1 Sauce Base'),      40,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens (Entree)'),      (SELECT ingredient_id FROM ing WHERE name='Broccoli Florets'),  100,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens (Entree)'),      (SELECT ingredient_id FROM ing WHERE name='Kale'),               60,'g'),
  ((SELECT menu_item_id FROM mi WHERE name='Super Greens (Entree)'),      (SELECT ingredient_id FROM ing WHERE name='#4 Veg Sauce'),       35,'g')
ON CONFLICT DO NOTHING;

COMMIT;
