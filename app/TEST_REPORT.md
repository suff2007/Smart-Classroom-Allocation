# Test Report — Smart Classroom & Blackboard Classroom Allocation System

## Executed in the available Linux environment

- Backend automated tests: **56 passed, 0 failed** (`npm test`, Node test runner).
- Frontend source parsing: **3 JS/JSX files parsed**, 6 imports checked, 0 parse/import resolution errors using Babel parser and static checks.
- ZIP integrity: checked after packaging; no corrupt members reported.
- Original timetable documents: **11 files included**.

## Not verified here

- Frontend production build: **not passed / not verified**. The available `node_modules` contained Windows-specific Rollup binaries; the Linux Rollup binary was missing. npm registry access failed with DNS `EAI_AGAIN`, so dependencies could not be reinstalled in this environment.
- Full live browser flow against MongoDB: **not run** because a configured live MongoDB service was not available.
- Deployment: not performed.

## How to complete verification on Windows

Run `VERIFY_PROJECT_WINDOWS.bat` from the extracted project folder on a Windows machine with Node.js LTS and internet access. It runs `npm ci` separately for backend and frontend, executes backend tests, and runs the Vite production build using platform-correct optional dependencies. Then configure `backend/.env` using `.env.example`, start MongoDB and follow `DEMO_GUIDE.md` to check Admin/Coordinator login, logout, classroom search, and real timetable availability.

This report intentionally distinguishes executed checks from checks that remain unverified. Passing automated tests does not prove every live workflow is error-free.
