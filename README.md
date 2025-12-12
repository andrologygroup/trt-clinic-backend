# trt-clinic-backend

Backend for TRT clinic integrating AthenaOne (OAuth + PKCE).

Quick overview
- This is a small Express server that implements PKCE-based OAuth with AthenaOne.
- Configure environment variables (see .env.example).
- The frontend URL you provided: https://www.bigfoot-t.com — the server will redirect users back to FRONTEND_URL/patient-portal after successful token exchange.

Local setup
1. Clone
   git clone https://github.com/andrologygroup/trt-clinic-backend.git
   cd trt-clinic-backend

2. Install dependencies (this creates node_modules/ and package-lock.json)
   npm install

3. Create .env from .env.example and fill values:
   cp .env.example .env
   # then edit .env to fill ATHENA_CLIENT_ID and SESSION_SECRET

4. Run locally
   npm start
   # server listens on PORT (default 3000). When running locally you may test the /auth/athena/login URL.

Important env vars
- ATHENA_CLIENT_ID — Athena OAuth client id
- SESSION_SECRET — random secret string for express-session
- HOST_URL — your backend base URL (used to build redirect URI)
- REDIRECT_URI — optional explicit redirect URI for Athena callback (defaults to HOST_URL + /auth/athena/callback)
- FRONTEND_URL — https://www.bigfoot-t.com (used after exchange to redirect the user)
- NODE_ENV — set to "production" in production so cookies are secure

Athena app configuration
- In your Athena developer console, set the OAuth redirect URI to:
  <HOST_URL>/auth/athena/callback
  e.g.: https://trt-clinic-backend.onrender.com/auth/athena/callback
- Ensure the client supports PKCE, and the scopes requested match what your Athena app is authorized for.

How node_modules and package-lock.json are created
- Running npm install will:
  - Download dependencies into node_modules/
  - Write exact dependency tree into package-lock.json
- Typical flow:
  npm install
  # node_modules/ and package-lock.json will be created in the project root

Deploying (recommended: Render, Railway, or Heroku)
Below are steps for Render (similar concepts apply to others).

Render (managed server)
1. Create a Render account and connect your GitHub.
2. Create a new Web Service and choose this repository.
3. Build Command: npm install
   Start Command: npm start
4. Set Environment variables in Render's dashboard:
   - ATHENA_CLIENT_ID
   - SESSION_SECRET
   - HOST_URL (set to the Render service URL, e.g. https://trt-clinic-backend.onrender.com)
   - FRONTEND_URL=https://www.bigfoot-t.com
   - NODE_ENV=production
5. Deploy. After deploy, make sure the Athena OAuth app has the callback URL set to:
   https://<your-render-service-domain>/auth/athena/callback

Heroku (if preferred)
1. heroku create trt-clinic-backend
2. git push heroku main
3. heroku config:set ATHENA_CLIENT_ID=... SESSION_SECRET=... FRONTEND_URL=https://www.bigfoot-t.com HOST_URL=https://<your-heroku-app>.herokuapp.com NODE_ENV=production
4. Heroku will run npm install automatically and create node_modules.

Notes & best practices
- In production set cookie.secure = true and run behind HTTPS.
- Consider storing tokens in a secure DB (session is ephemeral).
- Make sure your ATHENA app has the exact redirect URI configured.
- Use strong SESSION_SECRET and rotate if compromised.
- If you want me to update server.js to read REDIRECT_URI/FRONTEND_URL from env and use PORT, I included a suggested version below you can commit.
