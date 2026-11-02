# Deployment

The frontend and API are separate deployments. The Vercel project root is `frontend`; the Express API must run on a Node host that supports a persistent MongoDB connection.

## Vercel frontend

1. Import the repository into Vercel and set the project root directory to `frontend`.
2. Set `VITE_API_BASE_URL` to the deployed API origin, with no trailing slash (for example, `https://your-api-host.example`).
3. Deploy and copy the resulting frontend origin.

`frontend/vercel.json` keeps client-side routes on the React entry point.

## Express API

Deploy the `backend` directory to a Node.js host with Node 20.19 or newer. Use `npm start` as the start command. Configure these server-side environment variables in the host dashboard:

- `MONGODB_URI`: MongoDB Atlas or another reachable MongoDB URI.
- `SESSION_SECRET`: a newly generated random secret of at least 32 bytes.
- `FRONTEND_ORIGIN`: the exact Vercel origin (no path or trailing slash). Local origins may be comma-separated when needed.
- `TIMETABLE_REVIEW_API_KEY`: a separate random key of at least 32 bytes for timetable correction actions.
- `NODE_ENV=production`.

Do not put backend secrets in Vercel's `VITE_*` variables or in frontend source. Production sessions use MongoDB-backed storage and secure HTTP-only cookies. The API origin must be allowed by the frontend browser's credentialed requests.

Create the first privileged users by setting `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, and/or the corresponding `BOOTSTRAP_COORDINATOR_*` variables on the API host. Optional `BOOTSTRAP_ADMIN_NAME` and `BOOTSTRAP_COORDINATOR_NAME` values set display names. Run `npm run bootstrap:accounts` once from `backend`, then clear the bootstrap values. Existing users are not overwritten.

## External providers

This project is limited to the classroom-allocation workflow. It does not include email verification, WhatsApp/SMS delivery, or payment processing. Public sign-up is disabled; create Admin and Coordinator accounts through the one-time bootstrap script.
