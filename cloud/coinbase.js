const { sign } = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");

// Create Parse Cloud Function
Parse.Cloud.define("getCoinbaseOnrampTransactions", async (request) => {
  try {
    // Step 1: Prepare your keys
    const key_name = "2aedc492-fd0d-453d-adb5-bbc5dfc13567"; // Example: 2aedc492-fd0d-453d-adb5-bbc5dfc13567
    const key_secret = "-----BEGIN EC PRIVATE KEY-----\nvR0v/RHfQ6FsOaqLjC56q3dktb4//2EtkCnl1mPLOEEddM+Tnu2CY/8h5R1CruT/+2YEXTuEQHVPu/F7eP/ICg==\n-----END EC PRIVATE KEY-----\n"; // Your private key (PEM encoded or base64 decoded)
    const client_api_key = "XGbFS7Q4CdFwBqTDCKKZAZ9MUeGOQayn"; // optional if you need it later

    // Coinbase URL components
    const request_method = "GET";
    const request_host = "https://api.developer.coinbase.com";
    const request_path = "/onramp/v1/buy/transactions";

    const uri = `${request_method} ${request_host}${request_path}`;

    // Step 2: Sign the JWT
    const jwtToken = sign(
      {
        iss: "cdp",
        nbf: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 120, // Expires in 2 minutes
        sub: key_name,
        uri,
      },
      key_secret,
      {
        algorithm: "ES256",
        header: {
          kid: key_name,
          nonce: crypto.randomBytes(16).toString("hex"),
        },
      }
    );

    // Step 3: Make the API call to Coinbase
    const response = await axios.get(
      `${request_host}${request_path}`,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${jwtToken}`,
        },
      }
    );
      console.log(response.data,"response.data;")
    return response.data; // Return the transaction list
  } catch (error) {
    console.error("Coinbase Onramp API error:", error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
});
