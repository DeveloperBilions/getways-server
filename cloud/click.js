// cloud/main.js
import axios from "axios";

Parse.Cloud.define("createCheckoutSession", async (request) => {
  const { amount } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount: must be a positive integer.");
  }

  const objectId = request.user.id; 
  const username = request.user.get("username") || "User";
  const customerId = String(
    objectId
  ).trim();

  const customerName = String(
    username
  ).trim();

  // Type & presence checks
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Invalid amount: must be a positive integer.");
  }
  if (!customerId) {
    throw new Error("Missing customer id.");
  }
  if (!customerName) {
    throw new Error("Missing customer name.");
  }
  try {
    const resp = await axios.post("https://api.dev.clkk-api.io/api/partner/checkout/sessions",{
        "amount": amount*100,
        "success_url": "https://example.com/success",
        "cancel_url": "https://example.com/cancel",
        "customer": {
            "id": customerId,
            "name": customerName,
        }
      },{
      headers: {
        Authorization: 'Bearer ckpl_wChpcgGHHobBKfSpRx3FHOahkA5lOTJe4bmTD22RafI',
        "Content-Type": "application/json",
      },
    });

    return resp.data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;

    console.error("createCheckoutSession error:", {
      status,
      body,
      message: err.message,
    });

    // Throw a clean error to client
    throw new Parse.Error(
      status || Parse.Error.INTERNAL_SERVER_ERROR,
      body?.message || "Failed to create checkout session"
    );
  }
}, { requireUser: true }); // extra guard; blocks unauthenticated calls
