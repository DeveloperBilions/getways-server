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
        "amount": amount,
        "success_url": "http://localhost:3000/playerDashboard",
        "cancel_url": "http://localhost:3000/playerDashboard",
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

Parse.Cloud.define("expireOldCLKKTransactions", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(TransactionRecords);

  // 30 minutes ago
  const now = new Date();
  const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
  console.log(halfHourAgo,"halfHourAgohalfHourAgo")
  query.equalTo("portal", "CLK");
  query.equalTo("status", 1); // Pending
  query.lessThan("createdAt", halfHourAgo);
  query.limit(1000); // Max batch size

  try {
    const results = await query.find({ useMasterKey: true });

    if (results.length === 0) {
      return `No old CLKK transactions to update.`;
    }

    for (const txn of results) {
      txn.set("status", 9); // Mark as expired/failed
    }

    await Parse.Object.saveAll(results, { useMasterKey: true });

    return `Updated ${results.length} transactions to status 9.`;
  } catch (error) {
    console.error("❌ Error updating transactions:", error);
    throw new Error("Failed to update expired CLKK transactions.");
  }
});
