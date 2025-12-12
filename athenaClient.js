import axios from "axios";
import querystring from "querystring";

let backendToken = null;
let backendTokenExpires = null;

// Get a new client_credentials token from Athena
export async function getBackendToken() {
  const now = Date.now();

  // If token is still valid, reuse it
  if (backendToken && backendTokenExpires && now < backendTokenExpires) {
    return backendToken;
  }

  const tokenUrl = "https://api.platform.athenahealth.com/oauth2/v1/token";

  const r = await axios.post(
    tokenUrl,
    querystring.stringify({
      grant_type: "client_credentials",
      client_id: process.env.ATHENA_CLIENT_ID_BACKEND,
      client_secret: process.env.ATHENA_CLIENT_SECRET_BACKEND
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );

  backendToken = r.data.access_token;
  backendTokenExpires = now + r.data.expires_in * 1000 - 5000; // minus buffer

  return backendToken;
}

// Wrapper for Athena API requests
export async function athenaRequest(method, url, data = null) {
  const token = await getBackendToken();

  const response = await axios({
    method,
    url: `https://api.platform.athenahealth.com${url}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    data
  });

  return response.data;
}
