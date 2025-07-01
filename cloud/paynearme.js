const crypto = require('crypto');
const axios = require("axios");


Parse.Cloud.define("generatePNMSignature", async (request) => {
    const { secretKey, params } = request.params;
  
    // Validate input
    if (!secretKey) {
      throw "Missing 'secretKey'";
    }
    if (!params || typeof params !== 'object') {
      throw "Missing or invalid 'params'";
    }
  
    // These parameters must always be present
    const requiredParams = ["version", "site_identifier", "timestamp"];
  
    // These parameters should never be included in the signature
    const exemptParams = ["format", "signature", "call"];
  
    // Sort the keys alphabetically
    const paramKeys = Object.keys(params).sort();
  
    // Check required parameters
    requiredParams.forEach((key) => {
      if (!params[key]) {
        throw `Missing required parameter: ${key}`;
      }
    });
  
    // Build the string to sign
    let stringToSign = "";
    paramKeys.forEach((key) => {
      if (exemptParams.includes(key)) return;
      stringToSign += key + params[key];
    });
  
    // Generate the HMAC SHA256 signature
    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(stringToSign)
      .digest("hex");
  
    return { signature };
  })

  Parse.Cloud.define("createPNMOrder", async (request) => {
    const {
      customerIdentifier, // e.g., "player_123"
      paymentAmount       // e.g., "74.07"
    } = request.params;
  
    const siteIdentifier = process.env.PAYNEARME_SITE_IDENTIFIER;
    const apiKey = process.env.PAYNEARME_API_KEY;
    const secretKey = process.env.PAYNEARME_SECRET_KEY;
  
    if (!siteIdentifier || !apiKey || !secretKey) {
      throw "Missing PayNearMe credentials in environment variables.";
    }
  
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const version = "3.0";
  
    // 👇 1️⃣ Build parameters for signature
    const paramsForSignature = {
      order_amount: paymentAmount,
      order_currency: "USD",
      site_identifier: siteIdentifier,
      site_customer_identifier:customerIdentifier,
      timestamp: timestamp,
      order_type:"exact",
      version: version
    };
  
    // These parameters should never be included in the signature
    const exemptParams = ["format", "signature", "call"];
  
    // Sort the keys alphabetically
    const paramKeys = Object.keys(paramsForSignature).sort();
  
    // Build the string to sign
    let stringToSign = "";
    paramKeys.forEach((key) => {
      if (exemptParams.includes(key)) return;
      stringToSign += key + paramsForSignature[key];
    });
  
    // 👇 2️⃣ Generate the signature
    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(stringToSign)
      .digest("hex");
  
    console.log("Signature:", signature);
  
    // 👇 3️⃣ Build request body including signature
    const payload = {
      ...paramsForSignature,
      signature
    };
  
    try {
      const response = await axios.post(
        "https://api.paynearme-sandbox.com/json-api/create_order",
        payload,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
  
      console.log(response,"responseresponseresponse")
      const { secure_smart_token, pnm_order_identifier } = response.data.order;
  
      return {
        secureSmartToken: secure_smart_token,
        siteOrderIdentifier: pnm_order_identifier
      };
    }catch (error) {
        if (error.response) {
          // The server responded with a status code out of 2xx
          console.error("PayNearMe API Error Response Data:", error.response.data);
          console.error("Status:", error.response.status);
          console.error("Headers:", error.response.headers);
        } else if (error.request) {
          // The request was made but no response received
          console.error("No response received:", error.request);
        } else {
          // Something else happened
          console.error("Error creating order:", error.message);
        }
      
        throw `PayNearMe create_order failed: ${
          error.response?.data?.message || error.message
        }`;
      }
  });