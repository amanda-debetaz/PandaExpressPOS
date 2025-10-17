DO $$ BEGIN
  PERFORM 1 FROM pg_type WHERE typname = 'employee_role_enum';
  IF FOUND THEN DROP TYPE employee_role_enum; END IF;
  PERFORM 1 FROM pg_type WHERE typname = 'dine_option_enum';
  IF FOUND THEN DROP TYPE dine_option_enum; END IF;
  PERFORM 1 FROM pg_type WHERE typname = 'payment_method_enum';
  IF FOUND THEN DROP TYPE payment_method_enum; END IF;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE TYPE employee_role_enum AS ENUM ('manager','cook','cashier');
CREATE TYPE dine_option_enum   AS ENUM ('dine_in','takeout','delivery');
CREATE TYPE payment_method_enum AS ENUM ('cash','card','giftcard','dining_dollars');

-- =========
-- CORE REF
-- =========
CREATE TABLE employee (
  employee_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role employee_role_enum NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
);

CREATE TABLE category (
  category_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE menu_item (
  menu_item_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  category_id INT NOT NULL REFERENCES category(category_id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_menu_item_category ON menu_item(category_id);

CREATE TABLE option_group (
  option_group_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  min_select INT NOT NULL DEFAULT 0,
  max_select INT NOT NULL DEFAULT 1,
  CHECK (0 <= min_select AND min_select <= max_select)
);

-- Junction: which groups apply to which items
CREATE TABLE menu_item_option_group (
  menu_item_id INT NOT NULL REFERENCES menu_item(menu_item_id) ON DELETE CASCADE,
  option_group_id INT NOT NULL REFERENCES option_group(option_group_id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, option_group_id)
);

-- Options (can be global to group or item-scoped)
CREATE TABLE option (
  option_id SERIAL PRIMARY KEY,
  option_group_id INT NOT NULL REFERENCES option_group(option_group_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  menu_item_id INT NULL REFERENCES menu_item(menu_item_id) ON DELETE CASCADE
);
CREATE INDEX idx_option_group ON option(option_group_id);
CREATE INDEX idx_option_item ON option(menu_item_id);
-- Uniqueness: group-level
CREATE UNIQUE INDEX uq_option_group_name
  ON option(option_group_id, name)
  WHERE menu_item_id IS NULL;
-- Uniqueness: item-scoped
CREATE UNIQUE INDEX uq_option_item_name
  ON option(option_group_id, menu_item_id, name)
  WHERE menu_item_id IS NOT NULL;

-- =========
-- INVENTORY & RECIPE
-- =========
CREATE TABLE inventory (
  ingredient_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL, -- 'g','ml','pcs','lb', etc.
  servings_per_unit INT NOT NULL CHECK (servings_per_unit > 0), -- required by constraint
  par_level INT NOT NULL DEFAULT 0 CHECK (par_level >= 0),
  reorder_point INT NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  cost_per_unit NUMERIC(10,2) NOT NULL CHECK (cost_per_unit >= 0),
  lead_time_days INT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  is_perishable BOOLEAN NOT NULL DEFAULT FALSE,
  shelf_life_days INT NOT NULL DEFAULT 0 CHECK (shelf_life_days >= 0),
  allergen_info TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE recipe (
  menu_item_id INT NOT NULL REFERENCES menu_item(menu_item_id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL REFERENCES inventory(ingredient_id) ON DELETE RESTRICT,
  qty_per_item NUMERIC(12,3) NOT NULL CHECK (qty_per_item > 0),
  qty_unit TEXT NOT NULL,
  PRIMARY KEY (menu_item_id, ingredient_id)
);
CREATE INDEX idx_recipe_ing ON recipe(ingredient_id);

-- =========
-- ORDERS / ITEMS / PAYMENTS
-- =========
CREATE TABLE "order" (
  order_id SERIAL PRIMARY KEY,
  dine_option dine_option_enum NOT NULL DEFAULT 'takeout',
  employee_id INT NOT NULL REFERENCES employee(employee_id) ON DELETE RESTRICT,
  notes TEXT NULL
);


CREATE TABLE order_item (
  order_item_id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_item(menu_item_id) ON DELETE RESTRICT,
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0), -- copy of menu_item.price at time of sale
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0)
);
CREATE INDEX idx_order_item_order ON order_item(order_id);

CREATE TABLE order_item_option (
  order_item_id INT NOT NULL REFERENCES order_item(order_item_id) ON DELETE CASCADE,
  option_id INT NOT NULL REFERENCES option(option_id) ON DELETE RESTRICT,
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  PRIMARY KEY (order_item_id, option_id)
);
CREATE INDEX idx_oio_option ON order_item_option(option_id);

CREATE TABLE payment (
  payment_id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
  method payment_method_enum NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  auth_ref TEXT NULL
);
CREATE INDEX idx_payment_order ON payment(order_id);
