import express from "express";
import session from "express-session";
import axios from "axios";
import crypto from "crypto";
import querystring from "querystring";

const app = express();
app.use(express.json());

// ------------------------
// Session Setup
// ------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set true if serving over HTTPS with proxy
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
  const clientId = process.env.ATHENA_CLIENT_ID;
  const redirectUri = "https://trt-clinic-backend.onrender.com/auth/athena/callback";

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

    // refresh token
    "offline_access",

    // full read access to patient data
    "patient/*.read"
  ].join(" ");

  const params = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
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
        redirect_uri: "https://trt-clinic-backend.onrender.com/auth/athena/callback",
        client_id: process.env.ATHENA_CLIENT_ID,
        code_verifier: req.session.athena_code_verifier
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // Store patient tokens in session
    req.session.athena_tokens = response.data;

    // Redirect to your Builder.io patient portal
    return res.redirect("https://your-builder-frontend.com/patient-portal");
  } catch (err) {
    console.error("Token Exchange Error:", err.response?.data || err.message);
    return res.status(500).send("Token exchange failed");
  }
});

// ------------------------
// Start Server
// ------------------------
app.listen(3000, () => {
  console.log("Athena OAuth server running on port 3000");
});
