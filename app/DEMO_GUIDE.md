# Demo run sheet

## Before the demo
- Confirm MongoDB is reachable and `backend/.env` contains the connection string and a strong session secret.
- Create the Admin and Coordinator accounts once with `npm run bootstrap:accounts`.
- Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`) in separate terminals.
- Confirm `http://localhost:5000/api/health` returns `status: OK` and `http://localhost:5000/api/db-health` returns `connected: true`.
- Sign in as Admin, check Overview, Classroom search, Lend / borrow, Event allocation, Timetable quality, and Admin. Log out and repeat with Coordinator; verify the Admin-only page is hidden/blocked.

## Recommended demo flow
1. Show the login screen first and sign in as Coordinator.
2. Search room `507` in block `SMVB` for Monday 26 October 2026, 08:30–09:25. The verified source timetable should show a matching class conflict rather than claiming it is free.
3. Search another inventory room and explain that the system shows `CANNOT_VERIFY` when the available timetable evidence is not enough to certify availability.
4. Show the room transfer form and the event allocation preview.
5. Open Timetable quality and explain the distinction between verified source text and records that still require visual review.
6. Log out, sign in as Admin, and show the Admin page.

## Important accuracy note
Do not present `CANNOT_VERIFY` as `AVAILABLE`. Do not claim all 657 source timetable entries have been imported; the strict quality report still flags records that need room assignment or review. If MongoDB or the API is disconnected, say so rather than presenting persisted actions as saved.
