# Prisma Database Setup & Configuration

## Overview
This project uses Prisma as the ORM (Object-Relational Mapping) tool to manage database interactions with a PostgreSQL database. Prisma provides type-safe database access, automatic migrations, and a powerful query builder.

## Prisma Configuration

### Database Connection
- **Provider**: PostgreSQL
- **Connection String**: Configured via `DATABASE_URL` environment variable
- **Location**: `pos-backend/prisma/schema.prisma`

### Prisma Client Generation
The Prisma client is generated with a custom output path:
- **Output Location**: `pos-backend/src/generated/prisma/`
- **Generator**: `prisma-client-js`
- **Version**: 6.18.0

## NestJS Integration

### Prisma Service
The project includes a custom `PrismaService` that extends `PrismaClient`:
- **Location**: `pos-backend/src/prisma/prisma.service.ts`
- **Features**:
  - Automatic connection on module initialization
  - Proper cleanup on module destruction
  - Injectable service for dependency injection

### Prisma Module
The `PrismaModule` is configured as a global module, making `PrismaService` available throughout the application:
- **Location**: `pos-backend/src/prisma/prisma.module.ts`
- **Scope**: Global (available in all modules without explicit imports)

## Database Schema

### Core Models

#### Order Management
- **order**: Main order table with status tracking, dine-in/takeout options, and timestamps
- **order_item**: Individual items within an order with quantity and pricing
- **order_item_option**: Selected options for order items

#### Menu System
- **category**: Menu categories with display ordering
- **menu_item**: Menu items with pricing and active status
- **option_group**: Groupings of options (e.g., size, toppings)
- **option**: Individual options with price deltas
- **menu_item_option_group**: Many-to-many relationship between menu items and option groups

#### Inventory & Recipes
- **inventory**: Ingredient tracking with quantities, costs, reorder points, and allergen information
- **recipe**: Mapping of ingredients to menu items with quantities

#### Employee Management
- **employee**: Employee records with roles, passwords, and active status
- **clock_log**: Time tracking for employee clock-in/clock-out
- **shift_schedule**: Shift scheduling managed by managers
- **shift_assignment**: Assignment of employees to shifts

#### Payment & Pricing
- **payment**: Payment records with method, amount, and authorization
- **pricing_settings**: Key-value store for pricing configuration
- **tax_rate**: Tax rate definitions

#### Statistics & Administration
- **store_statistics**: Daily aggregated statistics (orders, revenue)
- **manager**: Manager records
- **team_members**: Team member information

### Enums
- **dine_option_enum**: `dine_in`, `takeout`
- **employee_role_enum**: `manager`, `cook`, `cashier`
- **payment_method_enum**: `cash`, `card`, `giftcard`, `dining_dollars`, `meal_swipe`
- **kitchen_status**: `queued`, `prepping`, `done`

### Database Relationships
- **One-to-Many**: Categories → Menu Items, Employees → Orders, Menu Items → Order Items
- **Many-to-Many**: Menu Items ↔ Option Groups, Menu Items ↔ Ingredients (Recipes)
- **Foreign Keys**: Properly configured with cascade and no-action behaviors

## Usage in Services

Services inject `PrismaService` to access the database:

```typescript
constructor(private readonly prisma: PrismaService) {}
```

Example query from `KioskService`:
- Fetches categories with nested menu items and option groups
- Filters by active status
- Orders by display order

## Prisma Commands

### Generate Prisma Client
```bash
npx prisma generate
```

### Run Migrations
```bash
npx prisma migrate dev
```

### View Database in Prisma Studio
```bash
npx prisma studio
```

### Format Schema
```bash
npx prisma format
```

## Dependencies
- `@prisma/client`: ^6.18.0
- `prisma`: ^6.18.0
- `@prisma/extension-accelerate`: ^2.0.2 (optional extension)

## Notes
- The schema includes check constraints that require additional setup for migrations
- Custom output path is configured for Prisma client generation
- Binary targets are set for Windows platform support

