// /cloud/FinixPayment.js
// Finix Payment Integration for Recharge Flow

const axios = require('axios');

// Finix API Configuration
const FINIX_API_URL = 'https://finix.sandbox-payments-api.com';
const FINIX_USERNAME = process.env.FINIX_USERNAME || 'USrgKhDfHANsh397HEaj6KVG';
const FINIX_PASSWORD = process.env.FINIX_PASSWORD || '8dbeeee1-a823-449a-8c07-b040da500bff';
const FINIX_APPLICATION_ID = process.env.FINIX_APPLICATION_ID || 'APmJRsgWpB5vkrNyJV6AAE1h';
const FINIX_MERCHANT_ID = process.env.FINIX_MERCHANT_ID || 'MUu8rsteYMtxggmWbST1hzei';
const FINIX_MERCHANT_IDENTITY_ID = process.env.FINIX_MERCHANT_IDENTITY_ID || 'IDkiS5k8CnuhEYhs3qKTxgEg';

// Finix API Helper
const finixAPI = axios.create({
  baseURL: FINIX_API_URL,
  auth: {
    username: FINIX_USERNAME,
    password: FINIX_PASSWORD,
  },
  headers: {
    'Content-Type': 'application/json',
    'Finix-Version': '2022-02-01',
  },
});

// Step 1: Create or Get Buyer Identity
async function createBuyerIdentity(userInfo) {
  console.log("🔄 Step 1: Creating/Getting Buyer Identity in Finix...");
  console.log("📤 Sending to Finix API - Create Identity:");
  console.log(JSON.stringify({
    entity: {
      email: userInfo.email || `${userInfo.username}@getways.com`,
      first_name: userInfo.firstName || userInfo.username,
      last_name: userInfo.lastName || "User",
      phone: userInfo.phone || "",
    },
    identity_roles: ["BUYER"],
    tags: {
      user_id: userInfo.userId,
      username: userInfo.username,
    },
  }, null, 2));

  try {
    const response = await finixAPI.post('/identities', {
      entity: {
        email: userInfo.email || `${userInfo.username}@getways.com`,
        first_name: userInfo.firstName || userInfo.username,
        last_name: userInfo.lastName || "User",
        phone: userInfo.phone || "",
      },
      identity_roles: ["BUYER"],
      tags: {
        user_id: userInfo.userId,
        username: userInfo.username,
      },
    });

    console.log("✅ Step 1 Complete: Identity created successfully");
    console.log("📥 Response from Finix API - Identity:");
    console.log(JSON.stringify(response.data, null, 2));

    return {
      success: true,
      identityId: response.data.id,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Error creating buyer identity:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Step 2: Create Payment Instrument using Token
async function createPaymentInstrument(token, identityId, instrumentType) {
  console.log("🔄 Step 2: Creating Payment Instrument in Finix...");
  console.log("📤 Sending to Finix API - Create Payment Instrument:");
  console.log(JSON.stringify({
    token: token,
    type: "TOKEN",
    identity: identityId,
    instrument_type: instrumentType,
  }, null, 2));

  try {
    const payload = {
      token: token,
      type: "TOKEN",
      identity: identityId,
    };

    // Add bank account validation if it's a bank account
    if (instrumentType === "BANK_ACCOUNT") {
      payload.attempt_bank_account_validation_check = true;
    }

    const response = await finixAPI.post('/payment_instruments', payload);

    console.log("✅ Step 2 Complete: Payment Instrument created successfully");
    console.log("📥 Response from Finix API - Payment Instrument:");
    console.log(JSON.stringify(response.data, null, 2));

    return {
      success: true,
      paymentInstrumentId: response.data.id,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Error creating payment instrument:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Step 3: Create Authorization (Hold funds)
async function createAuthorization(paymentInstrumentId, amount, currency = "USD", metadata = {}) {
  console.log("🔄 Step 3: Creating Authorization in Finix...");
  console.log("📤 Sending to Finix API - Create Authorization:");
  
  const amountInCents = Math.round(amount * 100);
  
  console.log(JSON.stringify({
    merchant: FINIX_MERCHANT_ID,
    source: paymentInstrumentId,
    amount: amountInCents,
    currency: currency,
    tags: metadata,
  }, null, 2));

  try {
    const response = await finixAPI.post('/authorizations', {
      merchant: FINIX_MERCHANT_ID,
      source: paymentInstrumentId,
      amount: amountInCents,
      currency: currency,
      tags: metadata,
    });

    console.log("✅ Step 3 Complete: Authorization created successfully");
    console.log("📥 Response from Finix API - Authorization:");
    console.log(JSON.stringify(response.data, null, 2));

    return {
      success: true,
      authorizationId: response.data.id,
      state: response.data.state,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Error creating authorization:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Step 4: Capture Authorization (Complete the payment)
async function captureAuthorization(authorizationId, amount = null) {
  console.log("🔄 Step 4: Capturing Authorization in Finix...");
  console.log("📤 Sending to Finix API - Capture Authorization:");
  console.log(`Authorization ID: ${authorizationId}`);
  
  const payload = { capture_amount: amount ? Math.round(amount * 100) : undefined };
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await finixAPI.post(`/authorizations/${authorizationId}/captures`, payload);

    console.log("✅ Step 4 Complete: Authorization captured successfully");
    console.log("📥 Response from Finix API - Capture:");
    console.log(JSON.stringify(response.data, null, 2));

    return {
      success: true,
      transferId: response.data.id,
      state: response.data.state,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Error capturing authorization:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Step 5: Create Direct Transfer (Alternative to Auth + Capture)
async function createTransfer(paymentInstrumentId, amount, currency = "USD", metadata = {}) {
  console.log("🔄 Step 5: Creating Direct Transfer in Finix...");
  console.log("📤 Sending to Finix API - Create Transfer:");
  
  const amountInCents = Math.round(amount * 100);
  
  console.log(JSON.stringify({
    merchant: FINIX_MERCHANT_ID,
    source: paymentInstrumentId,
    amount: amountInCents,
    currency: currency,
    tags: metadata,
  }, null, 2));

  try {
    const response = await finixAPI.post('/transfers', {
      merchant: FINIX_MERCHANT_ID,
      source: paymentInstrumentId,
      amount: amountInCents,
      currency: currency,
      tags: metadata,
    });

    console.log("✅ Step 5 Complete: Transfer created successfully");
    console.log("📥 Response from Finix API - Transfer:");
    console.log(JSON.stringify(response.data, null, 2));

    return {
      success: true,
      transferId: response.data.id,
      state: response.data.state,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Error creating transfer:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Main Cloud Function: Process Finix Recharge
Parse.Cloud.define("processFinixRecharge", async (request) => {
  console.log("🚀 Starting Finix Recharge Process...");
  console.log("📥 Request Parameters:");
  console.log(JSON.stringify(request.params, null, 2));

  const {
    token,
    amount,
    username,
    remark = "",
    userId,
    userParentId,
    instrumentType = "PAYMENT_CARD",
  } = request.params;

  // Validation
  if (!token || !amount || !userId) {
    console.error("❌ Missing required parameters");
    throw new Parse.Error(400, "Missing required parameters: token, amount, or userId");
  }

  try {
    // Fetch user details
    console.log(`🔍 Fetching user details for userId: ${userId}`);
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });
    
    console.log("✅ User found:", {
      username: user.get("username"),
      email: user.get("email"),
    });

    const userInfo = {
      userId: userId,
      username: user.get("username") || username,
      email: user.get("email"),
      firstName: user.get("name") || username,
      lastName: "User",
      phone: user.get("phoneNumber") || "",
    };

    // Step 1: Create Buyer Identity
    const identityResult = await createBuyerIdentity(userInfo);
    if (!identityResult.success) {
      throw new Parse.Error(500, `Failed to create buyer identity: ${JSON.stringify(identityResult.error)}`);
    }

    // Step 2: Create Payment Instrument
    const paymentInstrumentResult = await createPaymentInstrument(
      token,
      identityResult.identityId,
      instrumentType
    );
    if (!paymentInstrumentResult.success) {
      throw new Parse.Error(500, `Failed to create payment instrument: ${JSON.stringify(paymentInstrumentResult.error)}`);
    }

    // Step 3: Create Transfer (Direct payment)
    const transferResult = await createTransfer(
      paymentInstrumentResult.paymentInstrumentId,
      amount,
      "USD",
      {
        username: username,
        user_id: userId,
        remark: remark,
        type: "recharge",
      }
    );

    if (!transferResult.success) {
      throw new Parse.Error(500, `Failed to create transfer: ${JSON.stringify(transferResult.error)}`);
    }

    // Step 4: Create Transaction Record in Parse
    console.log("💾 Creating transaction record in Parse database...");
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
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
    
    // Store Finix-specific data
    transaction.set("finixTransferId", transferResult.transferId);
    transaction.set("finixPaymentInstrumentId", paymentInstrumentResult.paymentInstrumentId);
    transaction.set("finixIdentityId", identityResult.identityId);
    transaction.set("transactionIdFromStripe", transferResult.transferId); // For compatibility
    
    // Set status based on transfer state
    if (transferResult.state === "SUCCEEDED") {
      transaction.set("status", 2); // Completed
    } else if (transferResult.state === "PENDING") {
      transaction.set("status", 1); // Pending
    } else {
      transaction.set("status", 10); // Failed
    }

    await transaction.save(null, { useMasterKey: true });

    console.log("✅ Transaction record created:", transaction.id);
    console.log("🎉 Finix Recharge Process Completed Successfully!");

    // If transfer succeeded, update pot balance
    if (transferResult.state === "SUCCEEDED" && userParentId) {
      console.log("💰 Updating pot balance...");
      const { updatePotBalance } = require('./utility/utlis');
      await updatePotBalance(userParentId, amount, "recharge");
      console.log("✅ Pot balance updated");
    }

    return {
      success: true,
      message: "Recharge processed successfully",
      transactionId: transaction.id,
      finixTransferId: transferResult.transferId,
      state: transferResult.state,
    };

  } catch (error) {
    console.error("❌ Error in processFinixRecharge:");
    console.error(error);
    
    throw new Parse.Error(
      error.code || 500,
      error.message || "Failed to process Finix recharge"
    );
  }
});

// Webhook Handler for Finix Events (Optional)
Parse.Cloud.define("finixWebhook", async (request) => {
  console.log("🔔 Finix Webhook Received:");
  console.log("📥 Webhook Data:");
  console.log(JSON.stringify(request.params, null, 2));

  try {
    const event = request.params;
    const eventType = event.type;
    const transferData = event.data;

    console.log(`📌 Event Type: ${eventType}`);

    // Handle different event types
    if (eventType === "transfer.succeeded" || eventType === "transfer.updated") {
      const finixTransferId = transferData.id;
      
      console.log(`🔍 Looking for transaction with Finix Transfer ID: ${finixTransferId}`);
      
      // Find transaction in Parse
      const TransactionQuery = new Parse.Query("TransactionRecords");
      TransactionQuery.equalTo("finixTransferId", finixTransferId);
      const transaction = await TransactionQuery.first({ useMasterKey: true });

      if (transaction) {
        console.log(`✅ Transaction found: ${transaction.id}`);
        
        // Update status based on transfer state
        if (transferData.state === "SUCCEEDED") {
          transaction.set("status", 2); // Completed
          console.log("✅ Transaction status updated to COMPLETED");
        } else if (transferData.state === "FAILED") {
          transaction.set("status", 10); // Failed
          console.log("❌ Transaction status updated to FAILED");
        }

        await transaction.save(null, { useMasterKey: true });
        
        return { success: true, message: "Webhook processed successfully" };
      } else {
        console.warn(`⚠️ Transaction not found for Transfer ID: ${finixTransferId}`);
      }
    }

    return { success: true, message: "Webhook received" };
  } catch (error) {
    console.error("❌ Error processing Finix webhook:");
    console.error(error);
    throw error;
  }
});

module.exports = {
  createBuyerIdentity,
  createPaymentInstrument,
  createAuthorization,
  captureAuthorization,
  createTransfer,
};
