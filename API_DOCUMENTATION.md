# Panda Express POS System - API Documentation

Auto-generated TypeDoc-compatible documentation for all routes and functions.

## Table of Contents
- [Authentication Routes](#authentication-routes)
- [Navigation Routes](#navigation-routes)
- [Kitchen Routes](#kitchen-routes)
- [Kiosk Routes](#kiosk-routes)
- [Cart & Checkout](#cart--checkout)
- [Cashier Routes](#cashier-routes)
- [Employee Management](#employee-management)
- [Menu Management](#menu-management)
- [Inventory Management](#inventory-management)
- [Reporting](#reporting)
- [Utility Routes](#utility-routes)

---

## Authentication Routes

### POST /login
**Local authentication endpoint**
- **Body**: `{ employee_id: number, password_hash: string, next?: string }`
- **Description**: Authenticates user with employee ID and password
- **Returns**: Redirects to home or specified URL on success
- **Errors**: 
  - 400: Invalid credentials
  - 500: Authentication failure

### GET /auth/google
**Initiate Google OAuth flow**
- **Description**: Redirects to Google OAuth consent screen
- **Scope**: profile, email

### GET /auth/google/callback
**Handle Google OAuth callback**
- **Query**: `state` - Encoded redirect URL
- **Description**: Processes Google OAuth response and logs in user
- **Returns**: Redirects to home or specified URL

### GET /logout
**Logout endpoint**
- **Description**: Destroys session and logs out user
- **Returns**: Redirects to home page

---

## Navigation Routes

### GET /
**Home/navigation page**
- **Access**: Public
- **Description**: Displays role-based navigation with buttons for manager, cashier, kiosk, kitchen, etc.
- **Returns**: navigation.ejs view

### GET /manager
**Manager dashboard**
- **Access**: Manager role required
- **Description**: Main manager interface with employee management, menu management, inventory, and reports
- **Returns**: manager.ejs view

### GET /cashier
**Cashier POS interface**
- **Access**: Cashier role required
- **Description**: Point-of-sale terminal for taking orders
- **Returns**: cashier.ejs view

---

## Kitchen Routes

### GET /kitchen
**Kitchen display system**
- **Access**: Cook role required
- **Description**: Shows orders in three columns: Queued, Cooking, Done. Includes batch cooking interface.
- **Query Parameters**: None
- **Returns**: kitchen.ejs view with orders and prepared item stock

### POST /kitchen/:orderId/status
**Update order status**
- **Access**: Cook role required
- **Params**: `orderId` - Order ID to update
- **Body**: `{ status: 'queued' | 'prepping' | 'done' }`
- **Description**: 
  - Moves order through workflow stages
  - Marks done: increments daily statistics
  - Unmarked from done: decrements statistics
  - Handles prepared item stock consumption
- **Returns**: Redirects to /kitchen
- **Errors**:
  - 400: Invalid status or insufficient stock
  - 500: Database error

### POST /kitchen/:orderId/cancel
**Cancel order**
- **Access**: Cook role required
- **Params**: `orderId` - Order ID to cancel
- **Description**: Permanently deletes order (cascade deletes items and payment)
- **Returns**: Redirects to /kitchen

### POST /kitchen/clear-done
**Clear completed orders from view**
- **Access**: Cook role required
- **Description**: Sets cutoff date to now, hiding older completed orders
- **Returns**: Redirects to /kitchen

### GET /kitchen/events
**Server-Sent Events stream**
- **Access**: Public (used by kitchen display)
- **Description**: SSE endpoint for real-time kitchen updates. Sends keep-alive every 15 seconds.
- **Events**:
  - `queued-changed`: Order added/updated
  - `stock-updated`: Prepared item stock changed
  - `stock-refresh`: Full stock refresh needed

### GET /kitchen/queued-count
**Get queued order count**
- **Description**: Returns count of orders with status='queued' for polling
- **Returns**: `{ count: number }`

### POST /kitchen/stock/:menuItemId/cook
**Batch cook prepared items**
- **Access**: Cook role required
- **Params**: `menuItemId` - Menu item to cook
- **Body**: `{ servings: number }`
- **Description**: 
  - Validates ingredient availability
  - Decrements inventory
  - Increments prepared stock
  - Broadcasts stock update via SSE
- **Returns**: `{ success: true, stock: {...} }`
- **Errors**:
  - 400: Insufficient inventory
  - 500: Database error

### POST /kitchen/stock/discard
**Discard all prepared stock**
- **Access**: Cook role required
- **Description**: Resets all prepared item stock to 0 (end-of-day)
- **Returns**: `{ success: true }`

### GET /kitchen/stock
**Get prepared stock snapshot**
- **Description**: Returns current stock levels for all prepared items
- **Returns**: `{ success: true, stock: Array<{ menu_item_id, servings_available, menu_item }> }`

---

## Kiosk Routes

### GET /kiosk
**Self-service kiosk interface**
- **Access**: Authenticated users
- **Description**: 
  - Customer-facing menu with categories
  - Displays allergens, nutrition info, size pricing
  - Handles premium items (Honey Walnut Shrimp, Black Pepper Sirloin)
  - Size options: Small, Medium, Large for applicable items
- **Returns**: kiosk.ejs view with menu data

### GET /builder/:type
**Combo builder interface**
- **Access**: Public
- **Params**: `type` - 'bowl' | 'plate' | 'bigger-plate'
- **Description**: 
  - Interactive combo builder
  - Bowl: 1 side + 1 entree
  - Plate: 1 side + 2 entrees
  - Bigger Plate: 1 side + 3 entrees
- **Returns**: builder.ejs view

### GET /builder/edit
**Edit combo builder**
- **Query**: 
  - `index`: Cart item index to edit
  - `type`: Combo type
- **Description**: Loads existing combo for editing
- **Returns**: builder.ejs view with pre-filled data

### GET /menu-board
**Digital menu board**
- **Access**: Public
- **Query**: `page` - 'entrees' | 'a_la_carte' | 'sides' | 'appetizers' | 'featured'
- **Description**: Customer-facing digital signage with auto-cycling pages
- **Returns**: menu-board.ejs view

---

## Cart & Checkout

### POST /api/cart/add
**Add item to cart**
- **Access**: Authenticated users
- **Body**: `{ name: string, price: number }`
- **Description**: Adds item to session cart. Increments quantity if item exists.
- **Returns**: `{ success: true, cart: Array }`

### GET /api/cart
**Retrieve cart**
- **Description**: Returns current session cart
- **Returns**: `{ cart: Array }`

### DELETE /api/cart/clear
**Clear cart**
- **Description**: Empties session cart
- **Returns**: `{ success: true }`

### POST /api/checkout
**Kiosk checkout**
- **Access**: Authenticated users
- **Body**: 
  ```javascript
  {
    cart: Array<{
      name: string,
      baseName?: string,
      price: number,
      quantity: number,
      options?: Array<{name: string, qty: number}>
    }>,
    paymentMethod: 'credit' | 'debit' | 'cash' | 'mobile',
    dineOption: 'dine_in' | 'takeout'
  }
  ```
- **Description**:
  - Creates order, order_items, order_item_options, payment
  - Calculates tax from database
  - Stores per-item tax amounts
  - Status: 'queued'
- **Returns**: `{ success: true, order_id: number }`
- **Errors**:
  - 400: Empty cart, missing payment method, invalid dine option
  - 500: Database error

---

## Cashier Routes

### POST /api/clock/in
**Clock in employee**
- **Access**: Cashier role required
- **Body**: `{ employee_id: number }`
- **Description**: Verifies employee exists and is active
- **Returns**: `{ success: true, employee_id: number, display_name: string }`
- **Errors**:
  - 400: Missing employee_id or inactive employee
  - 404: Employee not found

### POST /api/clock/out
**Clock out employee**
- **Access**: Cashier role required
- **Description**: Simple acknowledgment (tracking handled client-side)
- **Returns**: `{ success: true }`

### POST /api/cashier/checkout
**Cashier checkout**
- **Access**: Cashier role required
- **Body**:
  ```javascript
  {
    cart: Array,
    paymentMethod: 'cash' | 'card' | 'giftcard' | 'dining_dollars' | 'meal_swipe',
    dineOption: 'dine_in' | 'takeout',
    clockedInEmployeeId: number
  }
  ```
- **Description**:
  - Creates order marked as 'done' immediately
  - Associates with employee
  - Updates daily store statistics
  - Calculates tax from database
- **Returns**: `{ success: true, order_id: number }`
- **Errors**:
  - 400: Empty cart or invalid payment method
  - 500: Database error

---

## Employee Management

### GET /api/employees
**List all employees**
- **Description**: Returns all employees with their roles and active status
- **Returns**: `{ employees: Array<Employee> }`

### POST /api/employees
**Create employee**
- **Body**:
  ```javascript
  {
    name: string,
    email: string,
    role: 'manager' | 'cashier' | 'cook',
    password_hash: string,
    hourly_rate?: number
  }
  ```
- **Returns**: `{ success: true, employee: Employee }`
- **Errors**:
  - 400: Missing required fields or duplicate email
  - 500: Database error

### PUT /api/employees/:id
**Update employee**
- **Params**: `id` - Employee ID
- **Body**: `{ name?: string, email?: string, hourly_rate?: number }`
- **Returns**: `{ success: true, employee: Employee }`

### PUT /api/employees/:id/role
**Update employee role**
- **Params**: `id` - Employee ID
- **Body**: `{ role: 'manager' | 'cashier' | 'cook' }`
- **Returns**: `{ success: true, employee: Employee }`

### PUT /api/employees/:id/deactivate
**Deactivate employee**
- **Params**: `id` - Employee ID
- **Description**: Sets is_active to false
- **Returns**: `{ success: true, employee: Employee }`

### PUT /api/employees/:id/reactivate
**Reactivate employee**
- **Params**: `id` - Employee ID
- **Description**: Sets is_active to true
- **Returns**: `{ success: true, employee: Employee }`

### PUT /api/employees/:id/reset-password
**Reset employee password**
- **Params**: `id` - Employee ID
- **Body**: `{ password_hash: string }`
- **Returns**: `{ success: true, employee: Employee }`

### DELETE /api/employees/:id
**Delete employee**
- **Params**: `id` - Employee ID
- **Description**: Permanently deletes employee record
- **Returns**: `{ success: true }`

---

## Shift Management

### POST /api/shifts
**Create shift schedule**
- **Body**:
  ```javascript
  {
    start_time: string (ISO 8601),
    end_time: string (ISO 8601),
    required_role: 'manager' | 'cashier' | 'cook'
  }
  ```
- **Returns**: `{ success: true, shift: ShiftSchedule }`

### DELETE /api/shifts/:id
**Delete shift**
- **Params**: `id` - Shift schedule ID
- **Returns**: `{ success: true }`

### POST /api/shifts/:id/assign
**Assign employee to shift**
- **Params**: `id` - Shift schedule ID
- **Body**: `{ employee_id: number }`
- **Returns**: `{ success: true, assignment: ShiftAssignment }`

### POST /api/shifts/:id/remove
**Remove employee from shift**
- **Params**: `id` - Shift schedule ID
- **Body**: `{ employee_id: number }`
- **Returns**: `{ success: true }`

### GET /api/shifts/date/:date
**Get shifts for date**
- **Params**: `date` - Date string (YYYY-MM-DD)
- **Returns**: `{ success: true, shifts: Array<ShiftWithAssignments> }`

### GET /api/shifts/employee/:id
**Get employee shifts**
- **Params**: `id` - Employee ID
- **Query**: `start_date`, `end_date` (optional)
- **Returns**: `{ success: true, shifts: Array<ShiftSchedule> }`

---

## Menu Management

### GET /api/menu
**List all menu items**
- **Returns**: `{ menu: Array<MenuItem> }`

### GET /api/menu/:id
**Get menu item details**
- **Params**: `id` - Menu item ID
- **Returns**: `{ item: MenuItem }`

### POST /api/menu
**Create menu item**
- **Body**:
  ```javascript
  {
    name: string,
    price: number,
    category_id: number,
    is_active?: boolean
  }
  ```
- **Returns**: `{ success: true, item: MenuItem }`

### PUT /api/menu/:id
**Update menu item**
- **Params**: `id` - Menu item ID
- **Body**: `{ name?: string, price?: number, category_id?: number, is_active?: boolean }`
- **Returns**: `{ success: true, item: MenuItem }`

### DELETE /api/menu/:id
**Delete menu item**
- **Params**: `id` - Menu item ID
- **Returns**: `{ success: true }`

### GET /api/menu/:id/recipe
**Get menu item recipe**
- **Params**: `id` - Menu item ID
- **Returns**: `{ recipe: Array<{ingredient_id, units_required, inventory}> }`

### PUT /api/menu/:id/recipe
**Update menu item recipe**
- **Params**: `id` - Menu item ID
- **Body**: `{ recipe: Array<{ingredient_id: number, units_required: number}> }`
- **Description**: Replaces entire recipe. Deletes old recipe entries and creates new ones.
- **Returns**: `{ success: true, recipe: Array<Recipe> }`

---

## Inventory Management

### GET /api/inventory
**List all inventory items**
- **Returns**: `{ inventory: Array<Inventory> }`

### POST /api/inventory
**Create inventory item**
- **Body**:
  ```javascript
  {
    name: string,
    current_quantity: number,
    reorder_level?: number,
    cost_per_unit?: number,
    supplier?: string,
    allergen_info?: string
  }
  ```
- **Returns**: `{ success: true, item: Inventory }`

### PUT /api/inventory/:id
**Update inventory item**
- **Params**: `id` - Inventory item ID
- **Body**: Partial Inventory fields
- **Returns**: `{ success: true, item: Inventory }`

### DELETE /api/inventory/:id
**Delete inventory item**
- **Params**: `id` - Inventory item ID
- **Returns**: `{ success: true }`

---

## Reporting

### GET /api/sales-report
**Sales report**
- **Query**: `start_date`, `end_date` (YYYY-MM-DD format)
- **Description**: Returns hourly sales data for date range
- **Returns**: 
  ```javascript
  {
    success: true,
    data: Array<{
      hour: string,
      orders: number,
      revenue: number
    }>
  }
  ```

### GET /api/x-report
**X-Report (hourly summary)**
- **Query**: `date` (YYYY-MM-DD format)
- **Description**: Hourly breakdown of sales for a specific day
- **Returns**:
  ```javascript
  {
    success: true,
    date: string,
    hourly: Array<{hour, orders, revenue}>,
    total_orders: number,
    total_revenue: number
  }
  ```

### GET /api/z-report
**Z-Report (end-of-day summary)**
- **Query**: `date` (YYYY-MM-DD format)
- **Description**: Complete daily summary with statistics
- **Returns**:
  ```javascript
  {
    success: true,
    date: string,
    total_orders: number,
    subtotal: number,
    discounts: number,
    tax: number,
    revenue: number,
    hourly: Array<{hour, orders, revenue}>
  }
  ```

### GET /api/restock-report
**Restock report**
- **Description**: Lists inventory items below reorder level
- **Returns**:
  ```javascript
  {
    success: true,
    items: Array<{
      ingredient_id,
      name,
      current_quantity,
      reorder_level,
      supplier
    }>
  }
  ```

---

## Utility Routes

### GET /api/tax-rate
**Get current tax rate**
- **Description**: Fetches tax rate from database for dynamic calculations
- **Returns**: `{ rate: number }` (decimal, e.g., 0.0825 for 8.25%)

### GET /api/weather
**Get current weather**
- **Description**: Fetches weather data from external API (location-based)
- **Returns**:
  ```javascript
  {
    success: true,
    temperature: number,
    condition: string,
    location: string
  }
  ```

### POST /api/translate
**Translate text**
- **Body**: `{ text: string, targetLang: string }`
- **Description**: Translates text using external translation API
- **Returns**: `{ success: true, translatedText: string }`

### GET /api/call-staff/stream
**Staff call SSE stream**
- **Description**: Server-Sent Events for staff call notifications
- **Events**: `staff-called` - Staff assistance requested

### POST /api/call-staff
**Request staff assistance**
- **Body**: `{ kioskId: string, message?: string }`
- **Description**: Sends notification to staff via SSE
- **Returns**: `{ success: true }`

---

## Database Schema Notes

### Key Models
- **employee**: Stores employee data, roles, credentials
- **menu_item**: Menu items with prices, categories
- **category**: Menu categories (Entrees, Appetizers, A La Carte, Sides, Beverages, Combos)
- **inventory**: Raw ingredients with quantities and reorder levels
- **recipe**: Junction table linking menu items to ingredients
- **order**: Customer orders with status tracking
- **order_item**: Individual items within an order
- **order_item_option**: Selected options (sides/entrees) for order items
- **option**: Available menu options (linked to menu_item)
- **payment**: Payment records linked to orders
- **tax_rate**: Current tax rate (single row table)
- **store_statistics**: Daily aggregated stats (orders, revenue, tax)
- **size_pricing**: Alternative pricing for small/large sizes and premium items
- **nutrition**: Nutritional information (calories, protein, fat, carbs) per menu item
- **shift_schedule**: Work shift schedules
- **shift_assignment**: Employee-to-shift assignments
- **clock_log**: Employee clock in/out records

### Order Workflow
1. **Kiosk**: status='queued'
2. **Kitchen**: queued → prepping → done
3. **Cashier**: status='done' immediately

### Statistics Tracking
- Incremented when order marked 'done'
- Decremented when order moved from 'done' to another status
- Daily aggregation by stats_date

### Premium Items
- Honey Walnut Shrimp
- Black Pepper Sirloin Steak
- Use capitalized size keys (Small/Large) in size_pricing table
- Regular items use lowercase (small/large)

### Tax Calculation
- Fetched dynamically from tax_rate table
- Stored per-item in order_item.tax_amount
- Included in store_statistics

---

## Middleware

### requireAuth(allowedRole)
**Authentication middleware factory**
- **Parameters**: `allowedRole` - string | string[] | undefined
- **Description**:
  - Checks if user is authenticated
  - Validates user role matches allowed roles
  - Managers bypass all role checks
- **Example**:
  ```javascript
  app.get('/cashier', requireAuth('cashier'), (req, res) => {...});
  app.get('/profile', requireAuth(), (req, res) => {...});
  app.get('/orders', requireAuth(['cashier', 'cook']), (req, res) => {...});
  ```

---

## Authentication Strategies

### Local Strategy
- **Field**: employee_id (number), password_hash (string)
- **Description**: Validates employee credentials against database
- **Password**: Plain text comparison (should be hashed in production)

### Google OAuth Strategy
- **Scope**: profile, email
- **Description**:
  - Checks if google_id exists in database
  - If not found, looks up by email
  - Links google_id to existing employee record
  - Denies login if no matching employee email

---

## Environment Variables

Required in `postgres.env`:
- `PSQL_HOST`: PostgreSQL host
- `PSQL_PORT`: PostgreSQL port (usually 5432)
- `PSQL_USER`: Database user
- `PSQL_PASSWORD`: Database password
- `PSQL_DATABASE`: Database name
- `DATABASE_URL`: Full connection string
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `SESSION_SECRET`: Session encryption secret
- `NODE_ENV`: 'production' or 'development'
- `PORT`: Server port (default 3000)

---

## Real-time Features

### Server-Sent Events (SSE)
1. **Kitchen Events** (`/kitchen/events`)
   - `queued-changed`: New order or status update
   - `stock-updated`: Prepared item stock changed
   - `stock-refresh`: Full refresh needed

2. **Staff Call Events** (`/api/call-staff/stream`)
   - `staff-called`: Customer needs assistance

### Polling Endpoints
- `/kitchen/queued-count`: Get count of queued orders (for auto-refresh)

---

## Error Handling

### Standard Error Responses
```javascript
{
  error: string,           // Human-readable error message
  details?: any            // Additional error details
}
```

### HTTP Status Codes
- **200**: Success
- **400**: Bad request (validation error, missing fields)
- **401**: Unauthorized (not logged in)
- **403**: Forbidden (insufficient permissions)
- **404**: Not found
- **500**: Internal server error (database error, unexpected error)

---

## Session Management

### Session Storage
- **Store**: Server-side session (express-session)
- **Timeout**: 30 minutes of inactivity
- **Cookie**: Secure in production, maxAge 30 minutes

### Session Data
- `cart`: Array of cart items
- User authentication via passport (req.user)
- Flash messages (req.flash)

---

## Security Notes

### Current Implementation
- ⚠️ **IMPORTANT**: Passwords stored as plain text (for development only)
- Session-based authentication with Passport.js
- Google OAuth integration for SSO
- Role-based access control (RBAC)
- CSRF protection not implemented (should be added for production)

### Production Recommendations
1. Hash passwords with bcrypt
2. Implement CSRF tokens
3. Enable HTTPS only (secure cookies)
4. Add rate limiting
5. Sanitize user inputs
6. Implement SQL injection protection (Prisma helps with this)
7. Add request validation middleware
8. Enable audit logging
9. Implement password complexity requirements
10. Add 2FA for manager accounts

---

## Performance Considerations

### Caching
- Menu cache object (currently basic, can be improved)
- Session-based cart storage
- Prepared stock in key-value pricing_settings table

### Database Optimization
- Indexes on foreign keys
- Compound indexes for common queries
- Transaction usage for critical operations
- Prisma query optimization with select/include

### Real-time Updates
- SSE instead of WebSockets (simpler, one-way communication)
- Broadcast to multiple clients efficiently
- Keep-alive pings every 15 seconds

---

## Testing Endpoints

### GET /test-db
**Database connection test**
- **Description**: Verifies Prisma database connection
- **Returns**: `{ connected: true, message: string }`

---

*Documentation auto-generated for TypeDoc compatibility. Last updated: 2025-12-10*
