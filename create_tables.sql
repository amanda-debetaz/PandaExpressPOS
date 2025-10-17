-- Aaron Thompson

begin;

create table employee (
  employee_id serial primary key,
  name text not null,
  role employee_role_enum not null,
  password_hash text not null,
  is_active boolean not null default true
);

create table category (
  category_id serial primary key,
  name text not null unique,
  display_order int not null default 0
);

create table menu_item (
  menu_item_id serial primary key,
  name text not null unique,
  price numeric(10,2) not null check (price >= 0),
  category_id int not null references category(category_id) on delete restrict,
  is_active boolean not null default true
);
create index idx_menu_item_category on menu_item(category_id);

create table option_group (
  option_group_id serial primary key,
  name text not null unique,
  min_select int not null default 0,
  max_select int not null default 1,
  check (0 <= min_select and min_select <= max_select)
);

create table menu_item_option_group (
  menu_item_id int not null references menu_item(menu_item_id) on delete cascade,
  option_group_id int not null references option_group(option_group_id) on delete cascade,
  primary key (menu_item_id, option_group_id)
);

create table "option" (
  option_id serial primary key,
  option_group_id int not null references option_group(option_group_id) on delete cascade,
  name text not null,
  price_delta numeric(10,2) not null default 0,
  menu_item_id int null references menu_item(menu_item_id) on delete cascade
);
create index idx_option_group on "option"(option_group_id);
create index idx_option_item on "option"(menu_item_id);

create unique index uq_option_group_name
  on "option"(option_group_id, name)
  where menu_item_id is null;

create unique index uq_option_item_name
  on "option"(option_group_id, menu_item_id, name)
  where menu_item_id is not null;

create table inventory (
  ingredient_id serial primary key,
  name text not null unique,
  unit text not null,
  servings_per_unit int not null check (servings_per_unit > 0),
  par_level int not null default 0 check (par_level >= 0),
  reorder_point int not null default 0 check (reorder_point >= 0),
  cost_per_unit numeric(10,2) not null check (cost_per_unit >= 0),
  lead_time_days int not null default 0 check (lead_time_days >= 0),
  is_perishable boolean not null default false,
  shelf_life_days int not null default 0 check (shelf_life_days >= 0),
  allergen_info text not null default '',
  is_active boolean not null default true
);

create table recipe (
  menu_item_id int not null references menu_item(menu_item_id) on delete cascade,
  ingredient_id int not null references inventory(ingredient_id) on delete restrict,
  qty_per_item numeric(12,3) not null check (qty_per_item > 0),
  qty_unit text not null,
  primary key (menu_item_id, ingredient_id)
);
create index idx_recipe_ing on recipe(ingredient_id);

create table "order" (
  order_id serial primary key,
  dine_option dine_option_enum not null default 'takeout',
  employee_id int not null references employee(employee_id) on delete restrict,
  notes text null,
  created_at timestamptz not null default now()
);

create table order_item (
  order_item_id serial primary key,
  order_id int not null references "order"(order_id) on delete cascade,
  menu_item_id int not null references menu_item(menu_item_id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0)
);
create index idx_order_item_order on order_item(order_id);

create table order_item_option (
  order_item_id int not null references order_item(order_item_id) on delete cascade,
  option_id int not null references "option"(option_id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  primary key (order_item_id, option_id)
);
create index idx_oio_option on order_item_option(option_id);

create table payment (
  payment_id serial primary key,
  order_id int not null references "order"(order_id) on delete cascade,
  method payment_method_enum not null,
  amount numeric(10,2) not null check (amount >= 0),
  auth_ref text null,
  created_at timestamptz not null default now(),
  paid_at timestamptz null
);
create index idx_payment_order on payment(order_id);

commit;