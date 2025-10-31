# Investor Desk - Frontend

A modern Next.js 14 application for managing investment portfolios and investor relations.

## Overview

This is the frontend-only version of the Investor Desk application. It communicates with a separate backend API for all data operations, authentication, and business logic.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **React**: 18.x
- **Styling**: CSS Modules
- **Authentication**: HTTP-only cookies (handled by backend)

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Backend API running (see Backend API Integration section)

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd investor-desk-frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and update the values:

```bash
cp env.example .env.local
```

Edit `.env.local` and set the following variables:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=https://your-backend.example.com

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 4. Run Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Environment Variables

### Required

- `NEXT_PUBLIC_API_URL` - The base URL of your backend API server (set per environment)

### Optional

- `NEXT_PUBLIC_APP_URL` - The URL where your frontend is hosted
- `NEXT_PUBLIC_BASE_URL` - Base URL for the application

## Project Structure

```
investor-desk-frontend/
├── app/                      # Next.js App Router pages and components
│   ├── admin/               # Admin panel pages
│   ├── components/          # React components
│   ├── contexts/            # React Context providers
│   ├── dashboard/           # User dashboard
│   ├── investment/          # Investment pages
│   └── ...                  # Other pages
├── lib/                     # Utility functions and helpers
│   ├── apiClient.js         # Centralized API communication
│   ├── dateUtils.js         # Date manipulation utilities
│   ├── formatters.js        # Data formatting functions
│   ├── validation.js        # Form validation utilities
│   └── ...
├── public/                  # Static assets (images, etc.)
├── middleware.js            # Next.js middleware (security headers)
├── next.config.js           # Next.js configuration
└── package.json             # Dependencies and scripts
```

## Available Scripts

- `npm run dev` - Start development server on port 3000
- `npm run build` - Build production bundle
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Backend API Integration

This frontend connects to the Robert Ventures backend API at:
**https://api.dev.robertventures.barva.dev**

### API Documentation

- **OpenAPI Spec**: Stored in `docs/openapi.json`
- **Live Swagger UI**: https://api.dev.robertventures.barva.dev/docs
- **TypeScript Types**: Auto-generated in `lib/apiTypes.ts`

### Staying in Sync

To update with the latest backend changes:

```bash
npm run update-api
```

This command:
1. Fetches the latest OpenAPI spec from the backend
2. Generates TypeScript types automatically
3. Updates `docs/openapi.json` and `lib/apiTypes.ts`

Run this when:
- Starting new features
- Backend team notifies you of API changes
- TypeScript shows type errors (might indicate API changes)

## Authentication Flow

1. User submits login credentials via frontend form
2. Frontend sends `POST /api/auth/login` to backend
3. Backend validates credentials and sets HTTP-only cookie
4. Frontend stores minimal user info in localStorage
5. All subsequent API calls include cookie via `credentials: 'include'`
6. Backend validates cookie on each request

## API Client

All API communication goes through the centralized `apiClient` in `lib/apiClient.js`. This ensures:

- Consistent error handling
- Automatic cookie management
- Request/response formatting
- Easy endpoint updates

Example usage:

```javascript
import { apiClient } from '@/lib/apiClient'

// Login
const result = await apiClient.login(email, password)

// Get user data
const user = await apiClient.getUser(userId)

// Create investment
const investment = await apiClient.createInvestment(userId, investmentData)
```

## Deployment

### Build for Production

```bash
npm run build
```

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Deploy to Netlify

1. Push your code to GitHub
2. Import project in Netlify
3. Set build command: `npm run build`
4. Set publish directory: `.next`
5. Set environment variables in Netlify dashboard
6. Deploy

**Important**: Make sure to configure `NEXT_PUBLIC_API_URL` to point to your production backend API.

## CORS and Cookies

The frontend uses `credentials: 'include'` for all API requests to ensure HTTP-only cookies are sent. Your backend must:

1. Set `Access-Control-Allow-Credentials: true`
2. Set `Access-Control-Allow-Origin` to your frontend domain (not `*`)
3. Use HTTP-only cookies for session management

In development, Next.js proxies `/api/*` requests to your backend to avoid CORS issues.

## Troubleshooting

### API Requests Failing

- Check that `NEXT_PUBLIC_API_URL` is set correctly
- Verify backend is running and accessible
- Check browser console for CORS errors

### Authentication Issues

- Ensure backend sets HTTP-only cookies correctly
- Check that cookies are being sent (`credentials: 'include'`)
- Verify CORS configuration on backend

### Build Errors

- Delete `.next` folder and `node_modules`
- Run `npm install` again
- Check for any missing environment variables

## Development Tips

- Use browser DevTools Network tab to inspect API calls
- Check console for helpful API client logs in development
- The API client logs which backend it's connected to on startup

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Proprietary - Robert Ventures

