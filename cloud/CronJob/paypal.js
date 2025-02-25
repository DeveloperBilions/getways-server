const axios = require("axios");

// PayPal Credentials
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API_URL = process.env.PAYPAL_API_URL;
const getPayPalAccessToken = async () => {
    try {
      const response = await axios.post(
        `${PAYPAL_API_URL}/v1/oauth2/token`,
        "grant_type=client_credentials",
        {
          auth: {
            username: PAYPAL_CLIENT_ID,
            password: PAYPAL_SECRET,
          },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      return response.data.access_token;
    } catch (error) {
      console.error("Error getting PayPal access token:", error.message);
      return null;
    }
};

Parse.Cloud.define("checkPayoutStatus", async (request) => {

    try {
      console.log("Running PayPal Payout Status Cron Job...");
  
      const accessToken = await getPayPalAccessToken();
      if (!accessToken) {
        console.error("Failed to get PayPal access token.");
        return;
      }
  
      // Fetch transactions that are in pending status
      const TransactionRecords = Parse.Object.extend("TransactionRecords");
      const query = new Parse.Query(TransactionRecords);
      query.equalTo("status", 11); // Filter for pending payouts
      query.containedIn("paymentMode", ["paypalId", "venmoId"]); // Match either PayPal or Venmo
      const transactions = await query.find();
  
      if (transactions.length === 0) {
        console.log("No pending payouts found.");
        return;
      }
  
      for (const transaction of transactions) {
        const payoutBatchId = transaction.get("paypalPayoutBatchId");
        if (!payoutBatchId) continue; // Skip if no payout batch ID
  
        // Check PayPal payout status
        const payoutResponse = await axios.get(
          `${PAYPAL_API_URL}/v1/payments/payouts/${payoutBatchId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
  
        const batchStatus = payoutResponse.data.batch_header.batch_status;
  
        console.log(`Transaction ${payoutBatchId}: Status - ${batchStatus}`);
  
        if (batchStatus === "SUCCESS") {
          transaction.set("status", 12);
          await transaction.save();
        } else if (batchStatus === "FAILED") {
            const failedItem = payoutResponse.data.items?.find(item => item.transaction_status === "FAILED");
            const failureReason = failedItem?.errors?.message || "Unknown failure reason";          
            transaction.set("status", 13);
            transaction.set("redeemRemarks", failureReason); // Store the failure reason
          await transaction.save();
        }
      }
    } catch (error) {
      console.error("Error checking PayPal payout status:", error.message);
    }
  })

