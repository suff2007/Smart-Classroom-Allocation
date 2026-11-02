# Demo readiness and test notes

## Project scope
- React multipage application: Overview, Classroom search, Lend / borrow, Event allocation, Timetable quality, Admin view, and login.
- Only two account roles are supported: **Admin** and **Coordinator**. Public account creation is disabled. Accounts are created once using the bootstrap script.
- Login is the initial screen when no authenticated session exists. Logout destroys the server session and returns the user to login.
- Express API with MongoDB-backed models for users, bookings, transfers, events, and timetable entries.
- Supplied room inventory has 22 rooms. Unknown capacities remain unknown.

## Real timetable handling
- The project includes 11 source timetable DOCX files and the extraction review data for 657 period entries.
- `SMVB` is a source-backed alias for `SMV` (Sir M. Visvesvaraya Block). `SVB` (Swami Vivekananda Block) and `CVR` (C. V. Raman Block) remain distinct identities.
- Availability now uses a room assignment from the period cell when present. If the period cell does not repeat a room, it may use the timetable's single, explicit section default room **only for `VERIFIED_TEXT` non-break/lunch/library periods**. It skips `Rotation`, ambiguous assignments, lab-like periods without an explicit room, and entries marked for visual review.
- A matching timetable class is marked occupied. If no conflict is found, the service still reports `CANNOT_VERIFY` unless full evidence is available; it does not label a room available merely because no conflict was found.
- The strict timetable quality/import report still reports its own explicit period-room validation separately. It must not be described as 657 imported/verified records.

## Local demo setup
1. Use Node.js 20.19+.
2. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, a long random `SESSION_SECRET`, and the two bootstrap account email/password pairs.
3. In a terminal: `cd backend`, `npm install`, `npm run bootstrap:accounts`, then `npm run dev`.
4. In a second terminal: `cd frontend`, `npm install`, then `npm run dev`.
5. Open the Vite URL. Sign in with the configured Admin or Coordinator credentials. Do not use real personal passwords for demo accounts.

## Test status
- Pure service tests cover block identity, timetable-derived occupancy, correction validation, import validation, and event allocation.
- The full API test suite requires backend dependencies. In the packaging environment, `npm ci` could not finish, so the complete test suite and production frontend build could not be run here. Run `npm ci && npm test` in `backend` and `npm ci && npm run build` in `frontend` before treating this as fully tested.

## Deployment
- Deploy `frontend` to Vercel and set `VITE_API_BASE_URL` to the deployed API origin.
- The Express API must also be hosted on a Node-compatible service with MongoDB. Vercel frontend hosting alone is not a complete deployment.
