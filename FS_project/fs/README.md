# Local Community Problem Reporting System

A lightweight full-stack web application for reporting local community issues.

## Features
- Front page with two options: Complainant and Admin
- Public complaint submission without login
- Admin-only login for reviewing all complaints
- Admins can see who filed each complaint and update statuses
- Server-side validation for required fields, category values, and field lengths
- Admin dashboard stats and filters

## API overview
- `POST /api/login`: Sign in as admin
- `POST /api/logout`: End the current session
- `GET /api/me`: Get the current session
- `GET /api/reports`: List all reports for the admin dashboard
- `GET /api/reports?status=open&category=road&q=street`: Filter reports
- `GET /api/reports/:id`: Get a report by id
- `GET /api/reports/stats`: Get report counts
- `POST /api/reports`: Create a public complaint
- `PATCH /api/reports/:id/status`: Update report status as admin

## Demo login
- Admin: `admin` / `admin123`
- Complaints can be submitted directly from the public form on the page

## Run locally
```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Run tests
```bash
npm test
```
