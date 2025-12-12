import express from "express";
import session from "express-session";
import axios from "axios";
import crypto from "crypto";
import querystring from "querystring";

const app = express();
app.use(express.json());

// Environment / URLs
const HOST_URL = process.env.HOST_URL || "https://trt-clinic-backend.onrender.com";
const REDIRECT_URI = process.env.REDIRECT_URI || `${HOST_URL}/auth/athena/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.bigfoot-t.com";
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";

// TRUST_PROXY can be "1" or "true" (case-insensitive)
const TRUST_PROXY = /^(1|true)$/i.test(String(process.env.TRUST_PROXY || ""));

// Required secrets / IDs
const SESSION_SECRET = process.env.SESSION_SECRET;
const ATHENA_CLIENT_ID = process.env.ATHENA_CLIENT_ID;

// Enable trust proxy when behind a proxy so req.secure and other proxy-aware features work
if (TRUST_PROXY) {
  // Using 1 trusts the first proxy (suitable for many PaaS setups)
  app.set("trust proxy", 1);
}

// Validate required config early
let failed = false;
if (!ATHENA_CLIENT_ID) {
  console.error(
    "FATAL: ATHENA_CLIENT_ID is not set. Please set ATHENA_CLIENT_ID in your environment."
  );
  failed = true;
}
if (!SESSION_SECRET) {
  console.error(
    "FATAL: SESSION_SECRET is not set. Please set SESSION_SECRET in your environment (do not commit secrets to source control)."
  );
  failed = true;
}
if (failed) {
  // Exit early so we don't start in a broken state
  process.exit(1);
}

// Determine whether cookies should be marked secure.
// Use secure cookies in production OR when behind a trusted proxy (so traffic is expected to be TLS-terminated upstream).
const cookieSecure = NODE_ENV === "production" || TRUST_PROXY;

// ------------------------
// Session Setup
// ------------------------
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: cookieSecure,
      sameSite: "lax",
    },
  })
);

// ------------------------
// PKCE Helpers
// ------------------------
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ------------------------
// OAuth Login -> Athena
// ------------------------
app.get("/auth/athena/login", (req, res) => {
  const clientId = ATHENA_CLIENT_ID;
  if (!clientId) {
    // This should not happen because we validated at startup, but keep a defensive check.
    console.error("ATHENA_CLIENT_ID is not set in environment");
    return res.status(500).send("Server misconfiguration: ATHENA_CLIENT_ID not set");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  // Store PKCE + state in session
  req.session.athena_code_verifier = codeVerifier;
  req.session.athena_oauth_state = state;

  const scope = [
    "openid",
    "profile",
    "fhirUser",
    "launch/patient",
    "offline_access",
    "patient/*.read"
  ].join(" ");

  const params = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    aud: "https://api.platform.athenahealth.com/fhir"
  };

  const authUrl =
    "https://api.platform.athenahealth.com/oauth2/v1/authorize?" +
    querystring.stringify(params);

  return res.redirect(authUrl);
});

// ------------------------
// OAuth Callback -> Token Exchange
// ------------------------
app.get("/auth/athena/callback", async (req, res) => {
  const { code, state } = req.query;

  // Validate state
  if (state !== req.session.athena_oauth_state) {
    return res.status(400).send("Invalid state");
  }

  const tokenUrl = "https://api.platform.athenahealth.com/oauth2/v1/token";

  try {
    const response = await axios.post(
      tokenUrl,
      querystring.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: ATHENA_CLIENT_ID,
        code_verifier: req.session.athena_code_verifier
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // Store patient tokens in session (or DB)
    req.session.athena_tokens = response.data;

    // Redirect to your frontend patient portal
    return res.redirect(`${FRONTEND_URL}/patient-portal`);
  } catch (err) {
    console.error("Token Exchange Error:", err.response?.data || err.message);
    return res.status(500).send("Token exchange failed");
  }
});

// Health check
app.get("/health", (req, res) => res.json({ ok: true, env: NODE_ENV }));

// ------------------------
// Start Server
// ------------------------
app.listen(PORT, () => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] Athena OAuth server starting`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`PORT: ${PORT}`);
  console.log(`HOST_URL: ${HOST_URL}${process.env.HOST_URL ? "" : " (default)"}`);
  console.log(
    `REDIRECT_URI: ${REDIRECT_URI}${process.env.REDIRECT_URI ? "" : " (derived from HOST_URL)"}`
  );
  console.log(`FRONTEND_URL: ${FRONTEND_URL}${process.env.FRONTEND_URL ? "" : " (default)"}`);
  console.log(`TRUST_PROXY: ${TRUST_PROXY}`);
  console.log(`cookie.secure: ${cookieSecure}`);
  console.log(`ATHENA_CLIENT_ID: ${ATHENA_CLIENT_ID ? "(present)" : "(missing)"}`);
  console.log("Server ready to accept requests.");
});