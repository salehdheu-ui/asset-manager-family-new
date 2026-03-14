# Family Fund OS

## Overview

Family Fund OS is a mobile-first Arabic web application designed as an operating system for managing an Omani family fund. The system prioritizes wealth preservation, family harmony, and generational trust over financial returns. It provides tools for managing family contributions, loans, expenses, governance, and transparent record-keeping through an immutable trust ledger.

The application follows a structured capital allocation model with four protected layers: Protected Capital (45%), Emergency Reserve (15%), Flexible Capital (20%), and Growth Capital (20%). Allocation amounts are locked at the beginning of each year based on total net assets across all time, and only the "used" amounts update during the year. Admin can re-lock or reset allocations from the admin dashboard.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state caching and synchronization
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **Animations**: Framer Motion for page transitions and micro-interactions
- **Language Support**: Arabic-first with RTL layout (right-to-left), using Cairo and Tajawal fonts

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Development**: Vite dev server with HMR proxied through Express
- **Production**: Static file serving from built assets

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `db:push` command

### Data Models
- **Members**: Family members with roles (guardian, custodian, member)
- **Contributions**: Monthly payment records with approval workflow
- **Loans**: Family loan requests with repayment schedules
- **Expenses**: Zakat, charity, and operational expenses
- **Family Settings**: Configurable fund parameters

### Build System
- **Client Build**: Vite bundling to `dist/public`
- **Server Build**: esbuild bundling to `dist/index.cjs`
- **Optimization**: Server dependencies allowlisted for bundling to reduce cold start times

## External Dependencies

### Database
- PostgreSQL database via `DATABASE_URL` environment variable
- Connection pooling with node-postgres (`pg`)
- Session storage with `connect-pg-simple`

### UI Framework Dependencies
- Radix UI primitives for accessible components
- Embla Carousel for swipeable content
- cmdk for command palette functionality
- Vaul for drawer components
- react-day-picker for calendar functionality

### Validation
- Zod for runtime schema validation
- drizzle-zod for database schema to Zod schema conversion
- react-hook-form with Zod resolver for form handling

### Replit Integration
- `@replit/vite-plugin-runtime-error-modal` for error display
- `@replit/vite-plugin-cartographer` for development mapping
- `@replit/vite-plugin-dev-banner` for development environment indicator