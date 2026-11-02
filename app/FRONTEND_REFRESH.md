# REVA Campus Operations — Premium Frontend Pass

This refresh uses the REVA University wordmark supplied for the project, tightens the sign-in layout for standard laptop screens, removes the unnecessary public-page navigation pill, and keeps authenticated operational data requests behind session restoration/sign-in. The room inventory error is now shown only inside the authenticated application instead of on the public sign-in page.

## Run locally on Windows

Terminal 1:

```powershell
cd "Smart Classroom & Blackboard Classroom Allocation Systemackend"
npm install
npm run dev
```

Terminal 2:

```powershell
cd "Smart Classroom & Blackboard Classroom Allocation Systemrontend"
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173/`). If the page appears scrolled, press `Ctrl+Home` once to return to the top.

## Important

- This is a frontend/layout refresh; it does not bypass authentication or fake successful sign-in.
- If login still fails, inspect the backend terminal and verify the existing account/password setup. Do not paste `.env` values, database URIs, passwords, or tokens into chat.
- The project package intentionally excludes `.env`, `node_modules`, and build output. Keep your existing `.env` locally and never commit it.
- The production build could not be verified in this packaging environment because dependency installation timed out. Run `npm run build` on the Windows machine after `npm install` and resolve any reported errors before deployment.
