// Finix Payment Integration for Recharge Flow
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

// Finix API config (values from .env)
const FINIX_API_URL = 'https://finix.sandbox-payments-api.com';
const FINIX_USERNAME = process.env.FINIX_USERNAME;
const FINIX_PASSWORD = process.env.FINIX_PASSWORD;
const FINIX_APPLICATION_ID = process.env.FINIX_APPLICATION_ID;
const FINIX_MERCHANT_ID = process.env.FINIX_MERCHANT_ID;
const FINIX_MERCHANT_IDENTITY_ID = process.env.FINIX_MERCHANT_IDENTITY_ID;

// Axios instance with Finix auth
const finixAPI = axios.create({
  baseURL: FINIX_API_URL,
  auth: { username: FINIX_USERNAME, password: FINIX_PASSWORD },
  headers: { 'Content-Type': 'application/json', 'Finix-Version': '2022-02-01' },
});

// Create buyer identity in Finix
async function createBuyerIdentity(userInfo) {
  try {
    const response = await finixAPI.post('/identities', {
      entity: {
        email: userInfo.email || `${userInfo.username}@getways.com`,
        first_name: userInfo.firstName || userInfo.username,
        last_name: userInfo.lastName || "User",
        phone: userInfo.phone || "",
      },
      identity_roles: ["BUYER"],
      tags: { user_id: userInfo.userId, username: userInfo.username },
    });
    return { success: true, identityId: response.data.id, data: response.data };
  } catch (error) {
    console.error("Error creating buyer identity:", error.response?.status, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Create payment instrument from token
async function createPaymentInstrument(token, identityId, instrumentType) {
  try {
    const payload = { token, type: "TOKEN", identity: identityId };
    if (instrumentType === "BANK_ACCOUNT") {
      payload.attempt_bank_account_validation_check = true;
    }
    const response = await finixAPI.post('/payment_instruments', payload);
    return { success: true, paymentInstrumentId: response.data.id, data: response.data };
  } catch (error) {
    console.error("Error creating payment instrument:", error.response?.status, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Create authorization (hold funds)
async function createAuthorization(paymentInstrumentId, amount, currency = "USD", metadata = {}) {
  const amountInCents = Math.round(amount * 100);
  try {
    const response = await finixAPI.post('/authorizations', {
      merchant: FINIX_MERCHANT_ID,
      source: paymentInstrumentId,
      amount: amountInCents,
      currency,
      tags: metadata,
    });
    return { success: true, authorizationId: response.data.id, state: response.data.state, data: response.data };
  } catch (error) {
    console.error("Error creating authorization:", error.response?.status, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Capture authorization (complete payment)
async function captureAuthorization(authorizationId, amount = null) {
  const payload = { capture_amount: amount ? Math.round(amount * 100) : undefined };
  try {
    const response = await finixAPI.post(`/authorizations/${authorizationId}/captures`, payload);
    return { success: true, transferId: response.data.id, state: response.data.state, data: response.data };
  } catch (error) {
    console.error("Error capturing authorization:", error.response?.status, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Create direct transfer (single-step payment)
async function createTransfer(paymentInstrumentId, amount, currency = "USD", metadata = {}) {
  const amountInCents = Math.round(amount * 100);
  try {
    const response = await finixAPI.post('/transfers', {
      merchant: FINIX_MERCHANT_ID,
      source: paymentInstrumentId,
      amount: amountInCents,
      currency,
      tags: metadata,
    });
    return {
      success: true,
      transferId: response.data.id,
      state: response.data.state,
      failureCode: response.data.failure_code || null,
      failureMessage: response.data.failure_message || null,
      data: response.data,
    };
  } catch (error) {
    console.error("Error creating transfer:", error.response?.status, error.response?.data);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Process Finix Recharge — main cloud function (supports Getways + AOG)
Parse.Cloud.define("processFinixRecharge", async (request) => {
  const {
    token, amount, username, remark = "", userId, userParentId,
    instrumentType = "PAYMENT_CARD",
    type = "Getways",   // "Getways" or "AOG"
    gc_coins,
    sc_coins
  } = request.params;

  if (!token || !amount || !userId) {
    throw new Parse.Error(400, "Missing required parameters: token, amount, or userId");
  }

  const isAOG = type === "AOG";
  const TableName = isAOG ? "Transactions" : "TransactionRecords";

  try {
    // Fetch user details (graceful — AOG users may not exist in _User table)
    let userInfo = {
      userId,
      username: username || userId,
      email: `${username || userId}@getways.com`,
      firstName: username || userId,
      lastName: "User",
      phone: "",
    };

    try {
      const userQuery = new Parse.Query(Parse.User);
      const user = await userQuery.get(userId, { useMasterKey: true });
      userInfo = {
        userId,
        username: user.get("username") || username,
        email: user.get("email") || userInfo.email,
        firstName: user.get("name") || username,
        lastName: "User",
        phone: user.get("phoneNumber") || "",
      };
    } catch (userErr) {
      console.log(`User lookup skipped for ${userId} (${type}):`, userErr.message);
    }

    // Create buyer identity
    const identityResult = await createBuyerIdentity(userInfo);
    if (!identityResult.success) {
      throw new Parse.Error(500, `Failed to create buyer identity: ${JSON.stringify(identityResult.error)}`);
    }

    // Create payment instrument from token
    const paymentInstrumentResult = await createPaymentInstrument(token, identityResult.identityId, instrumentType);
    if (!paymentInstrumentResult.success) {
      throw new Parse.Error(500, `Failed to create payment instrument: ${JSON.stringify(paymentInstrumentResult.error)}`);
    }

    // Create transfer (direct payment)
    const transferResult = await createTransfer(
      paymentInstrumentResult.paymentInstrumentId,
      amount,
      "USD",
      { username, user_id: userId, remark, type: "recharge" }
    );
    if (!transferResult.success) {
      throw new Parse.Error(500, `Failed to create transfer: ${JSON.stringify(transferResult.error)}`);
    }

    // Save transaction record (Getways → TransactionRecords, AOG → Transactions)
    const TransactionDetails = Parse.Object.extend(TableName);
    const transaction = new TransactionDetails();
    transaction.set("type", "recharge");
    transaction.set("gameId", "786");
    transaction.set("username", username);
    transaction.set("userId", userId);
    transaction.set("transactionDate", new Date());
    transaction.set("transactionAmount", amount);
    transaction.set("remark", remark);
    transaction.set("useWallet", false);
    transaction.set("userParentId", userParentId || "");
    transaction.set("portal", "Finix");
    transaction.set("finixTransferId", transferResult.transferId);
    transaction.set("finixPaymentInstrumentId", paymentInstrumentResult.paymentInstrumentId);
    transaction.set("finixIdentityId", identityResult.identityId);
    transaction.set("transactionIdFromStripe", transferResult.transferId); // compatibility

    // AOG-specific fields
    transaction.set("sc_coins", Number(sc_coins) || 0);
    transaction.set("gc_coins", Number(gc_coins) || 0);
    if (isAOG) {
      transaction.set("platform", "AOGCOINCLUB");
    }

    // Set status 1 (pending) for cron job to verify, or 10 if immediately failed
    if (transferResult.state === "FAILED") {
      transaction.set("status", 10);
    } else {
      transaction.set("status", 1); // pending - cron will verify and update to 2
    }

    await transaction.save(null, { useMasterKey: true });

    // Return failure if transfer was declined
    if (transferResult.state === "FAILED") {
      const failureMsg = transferResult.failureMessage || "Payment was declined by the card issuer.";
      const failureCode = transferResult.failureCode || "UNKNOWN";
      return {
        success: false,
        message: `Payment declined: ${failureMsg}`,
        failureCode,
        transactionId: transaction.id,
        finixTransferId: transferResult.transferId,
        state: transferResult.state,
      };
    }

    return {
      success: true,
      message: "Recharge processed successfully",
      transactionId: transaction.id,
      finixTransferId: transferResult.transferId,
      state: transferResult.state,
    };
  } catch (error) {
    console.error("Error in processFinixRecharge:", error);
    throw new Parse.Error(error.code || 500, error.message || "Failed to process Finix recharge");
  }
});

// Webhook handler for Finix transfer events
Parse.Cloud.define("finixWebhook", async (request) => {
  try {
    // Handle Finix test webhook (empty payload)
    if (!request.params || Object.keys(request.params).length === 0) {
      return { success: true, message: "Webhook endpoint verified" };
    }

    const { type: eventType, entity, _embedded } = request.params;

    // Finix sends type: "created" or "updated" with entity: "transfer"
    if (entity === "transfer" && _embedded?.transfers?.[0]) {
      const transferData = _embedded.transfers[0];
      
      const query = new Parse.Query("TransactionRecords");
      query.equalTo("finixTransferId", transferData.id);
      const transaction = await query.first({ useMasterKey: true });

      if (transaction) {
        if (transferData.state === "SUCCEEDED") {
          transaction.set("status", 2);
          await transaction.save(null, { useMasterKey: true });
          
          // Credit coins after successful payment
          const parentUserId = transaction.get("userParentId");
          const amount = transaction.get("transactionAmount");
          await updatePotBalance(parentUserId, amount, "recharge");
          
          return { success: true, message: "Webhook processed, coins credited" };
        } else if (transferData.state === "FAILED" || transferData.state === "CANCELED") {
          transaction.set("status", 10);
          await transaction.save(null, { useMasterKey: true });
          return { success: true, message: "Webhook processed, transaction failed" };
        }
        
        // For PENDING state, just acknowledge
        return { success: true, message: "Webhook received, transaction pending" };
      } else {
        console.warn("Transaction not found for transfer:", transferData.id);
      }
    }

    return { success: true, message: "Webhook received" };
  } catch (error) {
    console.error("Error processing Finix webhook:", error);
    return { success: true, message: "Webhook received" }; // Always return success to avoid retries
  }
}, {
  requireUser: false // Allow public access without authentication
});

// Finix Transaction Status Checker (processes both TransactionRecords + Transactions)
Parse.Cloud.define("checkTransactionStatusFinix", async (request) => {
  const processTransactionsFromTable = async (tableName) => {
    try {
      const query = new Parse.Query(tableName);
      query.equalTo("status", 1); // pending
      query.equalTo("portal", "Finix");
      query.exists("finixTransferId");
      query.limit(100);
      query.descending("updatedAt");

      const results = await query.find({ useMasterKey: true });
      if (!results || results.length === 0) return;

      const now = new Date();
      const recordsToUpdate = [];

      for (const record of results) {
        const transferId = record.get("finixTransferId");
        const createdAt = record.get("createdAt");

        const diffMs = now - createdAt;
        const diffMins = diffMs / (1000 * 60);

        // Expire after 45 minutes
        if (diffMins > 45) {
          record.set("status", 9);
          recordsToUpdate.push(record);
          continue;
        }

        try {
          // Check Finix transfer status via API
          const response = await axios.get(`${FINIX_API_URL}/transfers/${transferId}`, {
            auth: { username: FINIX_USERNAME, password: FINIX_PASSWORD },
            headers: { 'Finix-Version': '2022-02-01' }
          });

          const transferState = response.data.state;
          let newStatus;

          if (transferState === "SUCCEEDED") {
            newStatus = 2;
          } else if (transferState === "PENDING") {
            newStatus = 1;
          } else if (transferState === "FAILED" || transferState === "CANCELED") {
            newStatus = 10;
          } else {
            newStatus = 10;
          }

          record.set("status", newStatus);
          recordsToUpdate.push(record);

          // Credit coins only for TransactionRecords (Getways) — AOG handles its own wallet
          if (newStatus === 2 && tableName === "TransactionRecords") {
            const parentUserId = await getParentUserId(record.get("userId"));
            await updatePotBalance(parentUserId, record.get("transactionAmount"), "recharge");
          }
        } catch (error) {
          console.error(`Finix API error for transfer ${transferId} (${tableName}):`, error.response?.status, error.message);
        }
      }

      if (recordsToUpdate.length > 0) {
        await Parse.Object.saveAll(recordsToUpdate, { useMasterKey: true });
      }
    } catch (error) {
      console.error(`Error processing ${tableName} in checkTransactionStatusFinix:`, error.message);
    }
  };

  // Process transactions from both tables
  await processTransactionsFromTable("TransactionRecords");
  await processTransactionsFromTable("Transactions");
});

module.exports = {
  createBuyerIdentity,
  createPaymentInstrument,
  createAuthorization,
  captureAuthorization,
  createTransfer,
};
