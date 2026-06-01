# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands
- Build/Run: `npm run dev` or `npm start` (starts the Fastify server on port 3000 by default)
- Database Reset: `npm run reset` (runs `node db/reset.js`)
- Database Health Check: `node scripts/check-db.js`

## Architecture
The project is a Fastify-based backend serving a static frontend, designed for both standalone and serverless (Vercel) deployments.

### Backend Structure
- `server.js`: Main application builder (`buildApp`). Defines global plugins, static file serving, and route registrations.
- `api/index.js`: Vercel entry point that wraps the Fastify app using `serverless-http`.
- `routes/`: Contains modular route handlers:
  - `routes/student.js`: Student-related API endpoints (`/api/student`).
  - `routes/admin.js`: Admin-related API endpoints (`/api/admin`).
- `db/`: Database management:
  - `pool.js`: PostgreSQL connection pool management using `pg`.
  - `migrate.js`, `reset.js`, `seed.js`: Database lifecycle scripts.

### Frontend Structure
- `public/`: Pure static assets.
  - `index.html`, `app.js`, `style.css`: Main student-facing application.
  - `admin.html`, `admin.js`: Admin management interface.

### Key Patterns
- **Database Access**: The PG pool is attached to the Fastify instance via `app.decorate('db', pool)`, making it available as `req.server.db` (or similar) in routes.
- **Configuration**: Uses `dotenv` for environment variables (e.g., `DATABASE_URL`, `PORT`).
- **Deployment**: Hybrid approach supporting standard Node.js environments and Vercel Serverless Functions.
