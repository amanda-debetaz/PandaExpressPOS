# POS System Backend - Team 31 Project 3

A comprehensive Point of Sale (POS) system backend built with NestJS, Prisma, and PostgreSQL for CSCE 331.

## Overview

This project is a restaurant POS system backend that provides APIs for managing orders, menu items, inventory, employees, and more. The system supports multiple interfaces including kiosk ordering, cashier operations, kitchen management, and manager functions.

## Features

- **Kiosk Ordering**: Self-service ordering interface for customers
- **Cashier Operations**: POS terminal functionality for staff
- **Kitchen Management**: Order tracking and status updates for kitchen staff
- **Manager Functions**: Administrative features for store management
- **Inventory Management**: Track ingredients, recipes, and stock levels
- **Employee Management**: Employee roles, shifts, and clock-in/out functionality
- **Order Processing**: Complete order lifecycle from creation to payment
- **Menu Management**: Categories, items, options, and pricing

## Tech Stack

- **Framework**: NestJS 11.0.1
- **Language**: TypeScript 5.7.3
- **ORM**: Prisma 6.18.0
- **Database**: PostgreSQL
- **Validation**: class-validator, class-transformer

## Project Structure

```
Team_31---Project-3/
├── pos-backend/          # NestJS backend application
│   ├── src/
│   │   ├── kiosk/       # Kiosk ordering module
│   │   ├── cashier/     # Cashier operations module
│   │   ├── kitchen/     # Kitchen management module
│   │   ├── manager/     # Manager functions module
│   │   ├── prisma/      # Prisma service module
│   │   └── main.ts      # Application entry point
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
├── postgres.env          # Database connection configuration
├── requirements.txt      # Dependency reference
└── README.md            # This file
```

## Prerequisites

- Node.js (v18 or higher recommended)
- PostgreSQL database access
- npm or yarn package manager

## Installation

1. **Clone the repository** (if not already cloned)

2. **Navigate to the backend directory**:
   ```bash
   cd pos-backend
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Set up environment variables**:
   
   Create a `.env` file in the `pos-backend` directory with the following:
   ```env
   DATABASE_URL="postgresql://username:password@host:port/database"
   ```
   
   Or use the provided `postgres.env` file at the root level as a reference.

5. **Set up Prisma**:
   ```bash
   # Generate Prisma Client
   npx prisma generate
   
   # Run database migrations (if needed)
   npx prisma migrate dev
   ```

## Running the Application

### Development Mode

```bash
cd pos-backend
npm run start:dev
```

The server will start on `http://localhost:4000` with hot-reload enabled.

### Production Mode

```bash
cd pos-backend
npm run build
npm run start:prod
```

### Other Commands

```bash
# Start without watch mode
npm run start

# Run tests
npm run test

# Run e2e tests
npm run test:e2e

# Run tests with coverage
npm run test:cov

# Lint code
npm run lint

# Format code
npm run format
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Kiosk
- `GET /kiosk/menu` - Get menu items for kiosk display
- `POST /kiosk/orders` - Create a new paid order from kiosk

### Additional Modules
The system includes modules for:
- **Cashier**: Order processing and payment handling
- **Kitchen**: Order status updates and kitchen display
- **Manager**: Administrative functions and reporting

*(Note: Specific endpoints may vary. Check the controller files for detailed endpoint documentation.)*

## Database Schema

The database schema includes the following main entities:

- **Menu Items**: Categories, menu items, options, and option groups
- **Orders**: Order management with items, options, and status tracking
- **Payments**: Payment processing with multiple payment methods
- **Inventory**: Ingredients, recipes, and stock management
- **Employees**: Employee management with roles and shift assignments
- **Shift Schedules**: Shift management and employee assignments
- **Store Statistics**: Daily sales and performance metrics
- **Tax Rates**: Tax calculation settings

See `pos-backend/prisma/schema.prisma` for the complete schema definition.

## Configuration

### CORS
The application is configured to accept requests from `http://localhost:3000` (typical frontend development server). This can be modified in `pos-backend/src/main.ts`.

### Port
The default port is `4000`. This can be changed in `pos-backend/src/main.ts`.

## Development

### Code Style
The project uses:
- ESLint for linting
- Prettier for code formatting
- TypeScript for type safety

Run `npm run lint` to check for linting issues and `npm run format` to auto-format code.

### Testing
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`
- Coverage: `npm run test:cov`

## Database Connection

The application connects to a PostgreSQL database. Ensure your database is running and accessible before starting the application.

Database connection details can be found in `postgres.env` or configured via the `DATABASE_URL` environment variable.

## Contributing

This is a class project for Team 31, CSCE 331. Please follow the project guidelines and coding standards when contributing.

## License

This project is part of a CSCE 331 course assignment.

## Support

For issues or questions related to this project, please contact Team 31 members or refer to the course documentation.

---

**Team 31 - CSCE 331 Project 3**

