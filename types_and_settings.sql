BEGIN;
--Worked on by Isabelle Nguyen
-- enums, the column's values are predefined as:
CREATE TYPE employee_role_enum AS ENUM ('manager','cook','cashier');
CREATE TYPE dine_option_enum   AS ENUM ('dine_in','takeout');
CREATE TYPE payment_method_enum AS ENUM ('cash','card','giftcard','dining_dollars','meal_swipe');

-- tax rate, charged on each payment
CREATE TABLE tax_rate (
  name TEXT PRIMARY KEY,
  rate NUMERIC(6,4) NOT NULL CHECK (rate >= 0)
);

-- tax rate for MSC Panda located in College Station, TX
INSERT INTO tax_rate(name, rate)
VALUES ('TX_BRAZOS_GENERAL', 0.0825)
ON CONFLICT (name) DO UPDATE SET rate = EXCLUDED.rate;

-- Settings to account for different payments/upcharge
CREATE TABLE pricing_settings (
  key TEXT PRIMARY KEY,
  value NUMERIC(10,2) NOT NULL
);

-- Upcharge added for premium entree, meal swipes only pay for $8, need anotjher payment method if order total is more
INSERT INTO pricing_settings(key, value) VALUES
  ('premium_entree_upcharge', 1.25),
  ('meal_swipe_cap', 8.00)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;