-- Alex Slack
BEGIN;

-- Essentially it's just nuking all these objects in a safe order
DROP TRIGGER IF EXISTS trg_enforce_meal_swipe ON payment;
DROP FUNCTION IF EXISTS enforce_meal_swipe();
DROP FUNCTION IF EXISTS calc_tax(NUMERIC);

DROP TABLE IF EXISTS store_statistics CASCADE;
DROP TABLE IF EXISTS shift_assignment CASCADE;
DROP TABLE IF EXISTS shift_schedule CASCADE;
DROP TABLE IF EXISTS manager CASCADE;

DROP TABLE IF EXISTS order_item_option CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS order_item CASCADE;
DROP TABLE IF EXISTS "order" CASCADE;
DROP TABLE IF EXISTS recipe CASCADE;
DROP TABLE IF EXISTS menu_item_option_group CASCADE;
DROP TABLE IF EXISTS "option" CASCADE;
DROP TABLE IF EXISTS option_group CASCADE;
DROP TABLE IF EXISTS menu_item CASCADE;
DROP TABLE IF EXISTS category CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS employee CASCADE;

DROP TABLE IF EXISTS tax_rate CASCADE;
DROP TABLE IF EXISTS pricing_settings CASCADE;

DROP TYPE IF EXISTS payment_method_enum;
DROP TYPE IF EXISTS dine_option_enum;
DROP TYPE IF EXISTS employee_role_enum;

COMMIT;