-- Devan Patel


BEGIN;

-- Employees
INSERT INTO employee(name, role, password_hash) VALUES
  ('Alexis Nguyen','manager','CHANGE_ME'),
  ('Marco Diaz','cook','CHANGE_ME'),
  ('Priya Patel','cook','CHANGE_ME'),
  ('Jamal Carter','cook','CHANGE_ME'),
  ('Elena Garcia','cook','CHANGE_ME'),
  ('Noah Smith','cook','CHANGE_ME'),
  ('Grace Lee','cashier','CHANGE_ME'),
  ('Diego Martinez','cashier','CHANGE_ME'),
  ('Ava Thompson','cashier','CHANGE_ME'),
  ('Ethan Johnson','cashier','CHANGE_ME'),
  ('Sophia Brown','cashier','CHANGE_ME'),
  ('Liam Wilson','cashier','CHANGE_ME'),
  ('Mia Davis','cashier','CHANGE_ME'),
  ('Oliver Anderson','cashier','CHANGE_ME'),
  ('Isabella Clark','cashier','CHANGE_ME'),
  ('William Lewis','cashier','CHANGE_ME'),
  ('Emily Hall','cashier','CHANGE_ME'),
  ('Benjamin Young','cashier','CHANGE_ME'),
  ('Charlotte King','cashier','CHANGE_ME'),
  ('Henry Wright','cashier','CHANGE_ME')
ON CONFLICT DO NOTHING;

-- Manager table
CREATE TABLE IF NOT EXISTS manager (
  manager_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);


-- shift schedule table
CREATE TABLE IF NOT EXISTS shift_schedule (
  schedule_id SERIAL PRIMARY KEY,
  manager_id INT NOT NULL REFERENCES manager(manager_id) ON DELETE RESTRICT,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL
);

-- shift assignment table
CREATE TABLE IF NOT EXISTS shift_assignment (
  schedule_id INT NOT NULL REFERENCES shift_schedule(schedule_id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employee(employee_id) ON DELETE RESTRICT,
  role employee_role_enum NOT NULL,
  PRIMARY KEY (schedule_id, employee_id)
);

-- store statistics table
CREATE TABLE IF NOT EXISTS store_statistics (
  stats_date date PRIMARY KEY,
  total_orders INT NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discounts NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- add manager and shift schedule
INSERT INTO manager(name) VALUES ('Alexis Nguyen') ON CONFLICT DO NOTHING;

WITH mgr AS (SELECT manager_id FROM manager WHERE name='Alexis Nguyen'),
series AS (
  SELECT d::date AS dt
  FROM generate_series(date_trunc('day', now() - interval '365 days'),
                       date_trunc('day', now()), interval '1 day') d
)
INSERT INTO shift_schedule(manager_id, shift_date, start_time, end_time)
SELECT (SELECT manager_id FROM mgr), dt, TIME '09:00', TIME '21:00' FROM series
ON CONFLICT DO NOTHING;

INSERT INTO shift_assignment(schedule_id, employee_id, role)
SELECT s.schedule_id, e.employee_id, e.role
FROM shift_schedule s
JOIN employee e ON e.is_active
ON CONFLICT DO NOTHING;

-- calculate tax and meal swipes
CREATE OR REPLACE FUNCTION calc_tax(subtotal NUMERIC) RETURNS NUMERIC AS $$
DECLARE r NUMERIC; BEGIN
  SELECT rate INTO r FROM tax_rate WHERE name='TX_BRAZOS_GENERAL';
  RETURN round(subtotal * r, 2);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_meal_swipe() RETURNS trigger AS $$
DECLARE cap NUMERIC; count_swipes INT; BEGIN
  SELECT value INTO cap FROM pricing_settings WHERE key='meal_swipe_cap';
  IF NEW.method = 'meal_swipe' THEN
    IF NEW.amount > cap THEN RAISE EXCEPTION 'Meal swipe exceeds cap (%), got %', cap, NEW.amount; END IF;
    SELECT COUNT(*) INTO count_swipes FROM payment WHERE order_id = NEW.order_id AND method='meal_swipe';
    IF TG_OP='INSERT' THEN
      IF count_swipes > 0 THEN RAISE EXCEPTION 'Only one meal swipe allowed per order'; END IF;
    ELSIF TG_OP='UPDATE' THEN
      IF count_swipes > 1 OR (count_swipes=1 AND OLD.method='meal_swipe' AND NEW.method='meal_swipe' AND OLD.payment_id<>NEW.payment_id) THEN
        RAISE EXCEPTION 'Only one meal swipe allowed per order';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_meal_swipe ON payment;
CREATE TRIGGER trg_enforce_meal_swipe
BEFORE INSERT OR UPDATE ON payment
FOR EACH ROW EXECUTE FUNCTION enforce_meal_swipe();

COMMIT;


-- generate random orders and payments
BEGIN;

DO $$
DECLARE
  start_date date := (now() - interval '365 days')::date;
  end_date   date := now()::date;

  base_mon_thu int := 240;
  base_fri     int := 210;
  base_sat     int := 170;
  base_sun     int := 150;

  term_mult numeric;
  game_mult numeric;
  peak_mult numeric;

  day date; dow int; mon int; dom int; is_sat boolean;
  is_fall_peak_day boolean := false;
  is_spring_peak_day boolean := false;
  home_toggle int := 0;

  o_id int; e_id int; t timestamptz;
  combo_choice int; order_sub numeric; tax numeric; r numeric;
  n_expected int; n_today int;


BEGIN
  FOR day IN SELECT generate_series(start_date, end_date, interval '1 day')::date LOOP
    dow := extract(dow from day)::int;
    mon := extract(month from day)::int;
    dom := extract(day from day)::int;
    is_sat := (dow = 6);

    -- day of week 
    n_expected := CASE
      WHEN dow BETWEEN 1 AND 4 THEN base_mon_thu
      WHEN dow = 5 THEN base_fri
      WHEN dow = 6 THEN base_sat
      ELSE base_sun
    END;

    -- school year multiplier
    IF (mon = 12 AND dom >= 15) OR (mon = 1 AND dom <= 10) THEN
      term_mult := 0.55;
    ELSIF (mon = 5 AND dom >= 10) OR (mon IN (6,7)) OR (mon = 8 AND dom <= 5) THEN
      term_mult := 0.75;
    ELSE
      term_mult := 1.00;
    END IF;

    -- account for football
    IF is_sat AND mon BETWEEN 9 AND 11 THEN
      IF home_toggle % 2 = 0 THEN game_mult := 1.45; ELSE game_mult := 0.88; END IF;
      home_toggle := home_toggle + 1;
    ELSE
      game_mult := 1.00;
    END IF;

    -- start of semester spikes
    peak_mult := 1.00;
    IF NOT is_fall_peak_day AND ((mon = 8 AND dom >= 20 AND dow BETWEEN 1 AND 3) OR (mon = 9 AND dom <= 5 AND dow BETWEEN 1 AND 3)) THEN
      peak_mult := 2.60; is_fall_peak_day := TRUE;
    END IF;
    IF NOT is_spring_peak_day AND (mon = 1 AND dom BETWEEN 10 AND 25 AND dow BETWEEN 1 AND 3) THEN
      peak_mult := 2.40; is_spring_peak_day := TRUE;
    END IF;

    -- randomness
    r := (random() + random() + random() + random()) / 4.0;
    n_today := greatest(0, floor(n_expected * term_mult * game_mult * peak_mult * (0.80 + 0.45*r)));
    n_today := least(n_today, 900);

    -- generate orders
    FOR i IN 1..n_today LOOP
      SELECT employee_id INTO e_id
      FROM employee WHERE role='cashier' ORDER BY random() LIMIT 1;

      r := random();
      IF r < 0.45 THEN
        t := (day + time '11:00') + (random()*interval '3 hours');
      ELSIF r < 0.90 THEN
        t := (day + time '17:00') + (random()*interval '3 hours 30 min');
      ELSE
        t := (day + time '14:30') + (random()*interval '2 hours');
      END IF;

      INSERT INTO "order"(dine_option, employee_id, created_at)
      VALUES (CASE WHEN random() < 0.62 THEN 'takeout' ELSE 'dine_in' END, e_id, t)
      RETURNING order_id INTO o_id;

      order_sub := 0;

      -- combo choice
      combo_choice := CASE WHEN random() < 0.40 THEN 1
                           WHEN random() < 0.666 THEN 2
                           ELSE 3 END;

      IF combo_choice = 1 THEN
        INSERT INTO order_item(order_id, menu_item_id, qty, unit_price)
        SELECT o_id, menu_item_id, 1, price FROM menu_item WHERE name='Bowl';
        order_sub := order_sub + (SELECT price FROM menu_item WHERE name='Bowl');
      ELSIF combo_choice = 2 THEN
        INSERT INTO order_item(order_id, menu_item_id, qty, unit_price)
        SELECT o_id, menu_item_id, 1, price FROM menu_item WHERE name='Plate';
        order_sub := order_sub + (SELECT price FROM menu_item WHERE name='Plate');
      ELSE
        INSERT INTO order_item(order_id, menu_item_id, qty, unit_price)
        SELECT o_id, menu_item_id, 1, price FROM menu_item WHERE name='Bigger Plate';
        order_sub := order_sub + (SELECT price FROM menu_item WHERE name='Bigger Plate');
      END IF;

      -- occasional appetizer add-on
      IF random() < 0.26 THEN
        INSERT INTO order_item(order_id, menu_item_id, qty, unit_price)
        SELECT o_id, menu_item_id, 1, price
        FROM menu_item
        WHERE name IN ('Chicken Egg Roll','Veggie Spring Roll','Cream Cheese Rangoon')
        ORDER BY random() LIMIT 1;
        order_sub := order_sub + (
          SELECT price FROM menu_item
          WHERE name IN ('Chicken Egg Roll','Veggie Spring Roll','Cream Cheese Rangoon')
          ORDER BY random() LIMIT 1
        );
      END IF;

      -- tax
      UPDATE order_item
         SET tax_amount = round(unit_price * (SELECT rate FROM tax_rate WHERE name='TX_BRAZOS_GENERAL'), 2)
       WHERE order_id = o_id;

      tax := calc_tax(order_sub);

      -- payment mix
      IF random() < 0.62 THEN
        INSERT INTO payment(order_id, method, amount, paid_at)
        VALUES (o_id, 'card', round(order_sub + tax, 2), t + interval '5 minutes');
      ELSE
        IF random() < 0.32 THEN
          INSERT INTO payment(order_id, method, amount, paid_at)
          VALUES (o_id, 'meal_swipe', (SELECT value FROM pricing_settings WHERE key='meal_swipe_cap'), t + interval '5 minutes');
        END IF;

        IF random() < 0.45 THEN
          INSERT INTO payment(order_id, method, amount, paid_at)
          VALUES (
            o_id,
            'dining_dollars',
            GREATEST(
              0.00::numeric,
              ROUND(
                (
                  ((order_sub + tax) - COALESCE((SELECT SUM(amount) FROM payment WHERE order_id = o_id), 0::numeric))
                  * ((0.30 + random() * 0.40)::numeric)
                ),
                2
              )
            ),
            t + interval '5 minutes'
          );
        END IF;

        INSERT INTO payment(order_id, method, amount, paid_at)
        VALUES (
          o_id,
          CASE WHEN random() < 0.70 THEN 'card' ELSE 'cash' END,
          ROUND(((order_sub + tax) - COALESCE((SELECT SUM(amount) FROM payment WHERE order_id = o_id), 0::numeric)), 2),
          t + interval '5 minutes'
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- fill sides/entrees choices on combo items for combos
DO $$
DECLARE rec RECORD; n_entrees INT;
BEGIN
  FOR rec IN
    SELECT oi.order_item_id, mi.name AS combo_name
    FROM order_item oi
    JOIN menu_item mi ON mi.menu_item_id = oi.menu_item_id
    JOIN category c   ON c.category_id = mi.category_id
    WHERE c.name = 'Combos'
  LOOP
    -- sides for combos
    INSERT INTO order_item_option(order_item_id, option_id, qty)
    SELECT rec.order_item_id, o.option_id, 1
    FROM (
      SELECT o.option_id
      FROM "option" o
      JOIN option_group og ON og.option_group_id = o.option_group_id
      WHERE og.name = 'Choose Side'
      ORDER BY random()
      LIMIT (CASE WHEN random() < 0.15 THEN 2 ELSE 1 END)
    ) o;

    -- entree count by combo type for combos
    n_entrees := CASE rec.combo_name
      WHEN 'Bowl' THEN 1
      WHEN 'Plate' THEN 2
      WHEN 'Bigger Plate' THEN 3
      ELSE 1 END;

    INSERT INTO order_item_option(order_item_id, option_id, qty)
    SELECT rec.order_item_id, o.option_id, 1
    FROM (
      SELECT o.option_id
      FROM "option" o
      JOIN option_group og ON og.option_group_id = o.option_group_id
      WHERE og.name LIKE 'Choose Entrees (%'
      ORDER BY random()
      LIMIT n_entrees
    ) o;
  END LOOP;
END $$;

-- daily rollup
TRUNCATE store_statistics;

INSERT INTO store_statistics (stats_date, total_orders, subtotal, discounts, tax, revenue)
SELECT
  (o.created_at AT TIME ZONE 'America/Chicago')::date AS dt,
  COUNT(DISTINCT o.order_id)                           AS total_orders,
  COALESCE(SUM(oi.unit_price * oi.qty), 0)            AS subtotal,
  COALESCE(SUM(oi.discount_amount), 0)                AS discounts,
  COALESCE(SUM(oi.tax_amount), 0)                     AS tax,
  COALESCE(SUM(oi.unit_price * oi.qty + oi.tax_amount - oi.discount_amount), 0) AS revenue
FROM "order" o
LEFT JOIN order_item oi ON oi.order_id = o.order_id
GROUP BY dt
ORDER BY dt;

COMMIT;
