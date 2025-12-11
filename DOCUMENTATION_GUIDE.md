# Documentation Generation Guide

This project includes comprehensive JSDoc/TypeDoc-compatible comments throughout the codebase for automatic documentation generation.

## Overview

The codebase is fully documented with:
- **JSDoc comments** for all functions, routes, and middleware
- **TypeDoc configuration** for generating TypeScript-style documentation
- **Comprehensive API documentation** in `API_DOCUMENTATION.md`
- **Route descriptions** with parameters, returns, and error codes
- **Database schema documentation**

## Files

- **`typedoc.json`**: TypeDoc configuration for generating documentation
- **`jsdoc.json`**: JSDoc configuration for alternative documentation format
- **`API_DOCUMENTATION.md`**: Manual comprehensive API reference
- **`index.js`**: Main application file with extensive JSDoc comments

## Generating Documentation

### Prerequisites

Install documentation tools:

```bash
# From the root directory
cd c:\Users\djp90\Documents\CSCE331\Team_31---Project-3
npm install --save-dev jsdoc docdash http-server
```

### Generate JSDoc Documentation

```bash
npm run docs:jsdoc
```

This generates HTML documentation in `./docs/jsdoc` directory.

**Note**: This project uses JavaScript (not TypeScript), so JSDoc is the appropriate documentation tool. TypeDoc is designed for TypeScript projects and won't work with this codebase.

### Serve Documentation Locally

```bash
npm run docs:serve
```

Then open http://localhost:8080/jsdoc in your browser to view the generated documentation.

### Update Deployed Documentation

After making changes and regenerating docs:

```bash
# 1. Regenerate documentation
npm run docs

# 2. Deploy to Vercel
cd docs
vercel --prod
```

The live documentation will be updated at the Vercel URL.

### View Documentation Files

The generated documentation can be found at:
- **JSDoc HTML**: `./docs/jsdoc/index.html`
- **API Manual**: `./API_DOCUMENTATION.md` (markdown reference)
- **Live Documentation**: https://team31project3-px2mziqvo-devans-projects-40004d0c.vercel.app

## Documentation Structure

### Main Entry Point: `index.js`

All routes and functions are documented with:

```javascript
/**
 * Brief description
 * @route HTTP_METHOD /path
 * @async (if applicable)
 * @param {Type} paramName - Description
 * @body {Type} fieldName - Description (for POST/PUT)
 * @query {Type} paramName - Description (for GET with query params)
 * @access Role requirements
 * @description Detailed explanation of functionality
 * @returns {Type} Description of return value
 * @throws {ErrorCode} Description of error condition
 * @example
 * // Usage example
 * app.get('/example', requireAuth('role'), handler);
 */
```

### Route Categories

1. **Authentication Routes**
   - `/login`, `/logout`, `/auth/google`, `/auth/google/callback`

2. **Navigation Routes**
   - `/`, `/manager`, `/cashier`, `/kitchen`

3. **Kitchen Routes**
   - Order status updates, stock management, SSE streams

4. **Kiosk Routes**
   - Customer-facing menu, combo builders, checkout

5. **API Endpoints**
   - Cart management, checkout, employee management
   - Menu management, inventory, reporting
   - Utilities (weather, translation, tax rate)

### Middleware Documentation

All middleware functions are documented with:
- Purpose and functionality
- Parameters and return values
- Usage examples
- Access control logic

### Database Schema

The `API_DOCUMENTATION.md` file includes:
- Complete model descriptions
- Relationships between tables
- Field types and constraints
- Business logic notes (e.g., premium items, tax calculations)

## Comment Standards

### Function Comments

```javascript
/**
 * Function description
 * @function functionName
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 * @description Detailed explanation
 * @example
 * const result = functionName(param);
 */
```

### Route Comments

```javascript
/**
 * Brief route description
 * @route METHOD /path/:param
 * @async
 * @param {express.Request} req - Express request
 * @param {express.Response} res - Express response
 * @param {Type} req.params.param - Path parameter
 * @body {Type} field - Body field
 * @query {Type} field - Query parameter
 * @access Role requirement
 * @description Detailed functionality
 * @returns {Type} Response format
 * @throws {Code} Error condition
 */
```

### Middleware Comments

```javascript
/**
 * Middleware description
 * @middleware
 * @param {express.Request} req - Express request
 * @param {express.Response} res - Express response
 * @param {express.NextFunction} next - Next middleware
 * @description Detailed functionality
 */
```

### Constants and Variables

```javascript
/**
 * Variable description
 * @type {Type}
 * @description Purpose and usage
 * @default defaultValue
 */
const variableName = value;
```

## TypeDoc Tags

Supported tags in comments:
- `@param` - Function/route parameters
- `@returns` / `@return` - Return values
- `@throws` - Error conditions
- `@description` / `@desc` - Detailed description
- `@example` - Usage examples
- `@async` - Asynchronous function
- `@route` - HTTP route definition
- `@access` - Access control requirements
- `@body` - Request body fields
- `@query` - Query parameters
- `@middleware` - Middleware function
- `@type` - Variable type
- `@default` - Default value

## Documentation Output

### TypeDoc Output
- **Location**: `./docs`
- **Format**: HTML with navigation, search, and type information
- **Features**: 
  - Hierarchical navigation
  - Full-text search
  - Cross-references
  - Source code links

### JSDoc Output
- **Location**: `./docs/jsdoc`
- **Format**: HTML with Docdash theme
- **Features**:
  - Class/function listings
  - Source file links
  - Search functionality
  - Markdown support

### Manual Documentation
- **Location**: `API_DOCUMENTATION.md`
- **Format**: Markdown
- **Contents**:
  - Complete API reference
  - Route descriptions with examples
  - Database schema
  - Security notes
  - Performance considerations
  - Error handling

## Viewing Documentation

### Option 1: Static Files
Open `./docs/index.html` directly in your browser.

### Option 2: Local Server
```bash
npm run docs:serve
```
Visit http://localhost:8080

### Option 3: Deploy to GitHub Pages
1. Generate documentation: `npm run docs`
2. Commit `docs/` directory
3. Enable GitHub Pages in repository settings
4. Select `docs` folder as source

## Maintaining Documentation

### When Adding New Routes

1. Add JSDoc comment above route handler
2. Include all required tags (@route, @param, @returns, etc.)
3. Provide usage examples
4. Document error conditions

```javascript
/**
 * POST /api/new-endpoint - Brief description
 * @route POST /api/new-endpoint
 * @async
 * @param {express.Request} req - Express request
 * @param {express.Response} res - Express response
 * @body {string} field - Field description
 * @access Role required
 * @description Detailed explanation of functionality
 * @returns {Object} JSON response format
 * @throws {400} If validation fails
 * @throws {500} If database error occurs
 * @example
 * // Usage example
 * fetch('/api/new-endpoint', {
 *   method: 'POST',
 *   body: JSON.stringify({ field: 'value' })
 * });
 */
app.post('/api/new-endpoint', requireAuth('role'), async (req, res) => {
  // Implementation
});
```

### When Modifying Existing Routes

1. Update JSDoc comment to reflect changes
2. Update examples if behavior changed
3. Add/remove error conditions as needed
4. Update `API_DOCUMENTATION.md` if major changes

### Regenerating Documentation

After making changes:

```bash
npm run docs
```

Then commit updated `docs/` directory.

## Best Practices

1. **Be Descriptive**: Write clear, detailed descriptions
2. **Include Examples**: Provide usage examples for complex routes
3. **Document Errors**: List all possible error conditions
4. **Type Everything**: Specify types for all parameters and returns
5. **Update Manual Docs**: Keep `API_DOCUMENTATION.md` in sync
6. **Cross-Reference**: Link related functions and routes
7. **Explain Business Logic**: Document why, not just what

## Troubleshooting

### TypeDoc Not Generating

```bash
# Reinstall TypeDoc
npm install --save-dev typedoc typedoc-plugin-markdown

# Check configuration
npx typedoc --options typedoc.json --help
```

### JSDoc Errors

```bash
# Validate JSDoc config
npx jsdoc -c jsdoc.json --dry-run

# Check for syntax errors in comments
npx eslint index.js --fix
```

### Missing Dependencies

```bash
# Install all doc tools
npm install --save-dev typedoc typedoc-plugin-markdown jsdoc docdash http-server
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Generate Documentation

on:
  push:
    branches: [main]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm install --save-dev typedoc typedoc-plugin-markdown jsdoc docdash
      - run: npm run docs
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs
```

## Resources

- [TypeDoc Documentation](https://typedoc.org/)
- [JSDoc Documentation](https://jsdoc.app/)
- [Express Route Documentation](https://expressjs.com/en/guide/routing.html)
- [Prisma Documentation](https://www.prisma.io/docs/)

## Support

For questions about documentation:
1. Check `API_DOCUMENTATION.md` for comprehensive API reference
2. Review generated docs in `./docs` directory
3. Examine JSDoc comments in `index.js`
4. Consult TypeDoc/JSDoc official documentation

---

**Last Updated**: 2025-12-10
**Documentation Version**: 1.0.0
