# Smart Classroom & Blackboard Classroom Allocation System

## Requirements
- Node.js LTS (Node 20.19+; Node 22 LTS recommended)
- npm
- MongoDB connection for live authentication and persistent data
- Internet access for the first dependency installation

## Fast verification on Windows
1. Extract this ZIP.
2. Double-click `VERIFY_PROJECT_WINDOWS.bat`.
3. Wait for backend `npm ci`, backend tests, frontend `npm ci`, and frontend production build.
4. Both the backend tests and frontend build must report PASS before treating those checks as successful.

## Manual setup
1. Copy `backend/.env.example` to `backend/.env` and set the MongoDB URI and session/auth secrets as documented.
2. In `backend`, run `npm ci`, then `npm test`, then `npm start`.
3. In a separate terminal, in `frontend`, run `npm ci`, then `npm run dev`.
4. Follow `DEMO_GUIDE.md` for account setup and the demo flow.

Only Admin and Coordinator roles are supported. No Student role or public Student registration is included.

## Timetable safety
The source timetable documents are included. Ambiguous/unverified rows must remain flagged for review and must not be used to claim a room is available. See `TEST_REPORT.md` for exactly which checks ran and which still need local verification.
