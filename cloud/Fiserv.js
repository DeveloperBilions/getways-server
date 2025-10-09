const crypto = require('crypto');
const fetch = require('node-fetch');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading Fiserv.js file...');

// Utility function to generate unique merchant transaction IDs
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `FISERV-${shortUserId}-${timestamp}`;
};

// Utility function to generate HMAC signature for Fiserv API
const generateHmacSignature = (message, secret) => {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

// Utility function to generate headers for Fiserv API requests
const generateFiservHeaders = (body = '') => {
  const clientRequestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  
  // Create message for signature
  const message = process.env.FISERV_API_KEY + clientRequestId + timestamp + body;
  const signature = generateHmacSignature(message, process.env.FISERV_SECRET_KEY);
  
  return {
    'Content-Type': 'application/json',
    'Api-Key': process.env.FISERV_API_KEY,
    'Client-Request-Id': clientRequestId,
    'Timestamp': timestamp,
    'Message-Signature': signature
  };
};

// Create Fiserv Payment Link
Parse.Cloud.define("fiservCreatePaymentLink", async (request) => {
  const { 
    amount, 
    orderId,
    customerInfo,
    expiryHours = 24 
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  // Validate required fields
  if (!amount) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Amount is required."
    );
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Invalid amount: must be a positive number."
    );
  }

  try {
    const merchantTransactionId = generateMerchantTransactionId(request.user.id);
    const finalOrderId = orderId || `ORDER-${Date.now()}`;
    
    // Calculate expiry date
    const expiryDateTime = new Date();
    expiryDateTime.setHours(expiryDateTime.getHours() + expiryHours);

    // Validate required environment variables
    const requiredEnvVars = ['FISERV_STORE_ID', 'FISERV_API_KEY', 'FISERV_SECRET_KEY', 'FISERV_API_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          `${envVar} environment variable is required`
        );
      }
    }

    // Prepare payment link request body
    const requestBody = {
      storeId: process.env.FISERV_STORE_ID,
      merchantTransactionId: merchantTransactionId,
      transactionOrigin: "ECOM",
      transactionType: "SALE",
      transactionAmount: {
        total: parsedAmount,
        currency: "USD"
      },
      order: {
        orderId: finalOrderId,
        ...(customerInfo && {
          billing: {
            person: {
              firstName: customerInfo.firstName || null,
              lastName: customerInfo.lastName || null
            },
            contact: {
              email: customerInfo.email || null,
              phone: customerInfo.phone || null
            },
            ...(customerInfo.address && {
              address: {
                address1: customerInfo.address.address1 || null,
                city: customerInfo.address.city || null,
                region: customerInfo.address.region || null,
                postalCode: customerInfo.address.postalCode || null,
                country: customerInfo.address.country || "US"
              }
            })
          }
        })
      },
      checkoutSettings: {
        locale: "en_US",
        webHooksUrl: `${process.env.FRONTEND_URL}/api/fiserv-webhook`
      },
      paymentLinkDetails: {
        expiryDateTime: expiryDateTime.toISOString()
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateFiservHeaders(bodyString);

    // Make API call to Fiserv
    const response = await fetch(`${process.env.FISERV_API_URL}/payment-links`, {
      method: 'POST',
      headers: headers,
      body: bodyString
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const fiservResponse = await response.json();
    
    // Save transaction record
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionDetails();
    const user = await request.user.fetch({ useMasterKey: true });

    transactionDetails.set("type", "recharge");
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", user.get("username") || "");
    transactionDetails.set("userId", user.id);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", parsedAmount);
    transactionDetails.set("remark",);
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user.get("userParentId") || "");
    transactionDetails.set("status", 1); // pending
    transactionDetails.set("portal", "Fiserv");
    transactionDetails.set("referralLink", fiservResponse.paymentLink?.paymentLinkUrl || "");
    transactionDetails.set("transactionIdFromStripe", fiservResponse.paymentLink?.paymentLinkId || "");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("fiservOrderId", finalOrderId);
    transactionDetails.set("fiservCheckoutId", fiservResponse.paymentLink?.checkoutId || "");

    await transactionDetails.save(null, { useMasterKey: true });

    return {
      success: true,
      paymentLink: fiservResponse.paymentLink,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      publicUrl: fiservResponse.paymentLink?.paymentLinkUrl // For iframe
    };

  } catch (error) {
    console.error("Fiserv payment link creation error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to create Fiserv payment link"
    );
  }
});

// Get Fiserv Payment Link Details
Parse.Cloud.define("fiservGetPaymentLinkDetails", async (request) => {
  const { paymentLinkId } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  if (!paymentLinkId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Payment Link ID is required."
    );
  }

  try {
    const headers = generateFiservHeaders();

    // Make API call to get payment link details
    const response = await fetch(`${process.env.FISERV_API_URL}/payment-links/${paymentLinkId}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const fiservResponse = await response.json();
    
    return {
      success: true,
      paymentLinkDetails: fiservResponse
    };

  } catch (error) {
    console.error("Fiserv payment link details error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to get Fiserv payment link details"
    );
  }
});

// Check Fiserv Payment Status and Update Balance
Parse.Cloud.define("checkFiservPaymentsRecharge", async (request) => {
  try {
    console.log("🔄 Starting Fiserv payment status check...");

    // Find all pending Fiserv transactions
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Fiserv");
    query.equalTo("status", 1); // pending
    query.limit(100);

    const pendingTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${pendingTransactions.length} pending Fiserv transactions`);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        const paymentLinkId = transaction.get("transactionIdFromStripe");
        if (!paymentLinkId) {
          console.log(`⚠️ No payment link ID for transaction ${transaction.id}`);
          continue;
        }

        // Get payment link details from Fiserv
        const headers = generateFiservHeaders();
        const response = await fetch(`${process.env.FISERV_API_URL}/payment-links/${paymentLinkId}`, {
          method: 'GET',
          headers: headers
        });

        if (!response.ok) {
          console.log(`❌ Fiserv API error for transaction ${transaction.id}: ${response.status}`);
          continue;
        }

        const fiservData = await response.json();
        const transactionStatus = fiservData.transactionStatus;
        
        console.log(`📋 Transaction ${transaction.id} status: ${transactionStatus}`);

        if (transactionStatus === "APPROVED") {
          // Payment successful - update balance and transaction status
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");

          // Update pot balance using the correct pattern
          const parentUserId = await getParentUserId(userId);
          await updatePotBalance(parentUserId, amount, "recharge");
          
          transaction.set("status", 2); // completed
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`✅ Transaction ${transaction.id} completed successfully`);
          successCount++;
        } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus)) {
          // Payment failed
          transaction.set("status", 9); // failed
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("failedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Transaction ${transaction.id} failed with status: ${transactionStatus}`);
          failedCount++;
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        failedCount++;
      }
    }

    console.log(`🏁 Fiserv payment check completed: ${processedCount} processed, ${successCount} successful, ${failedCount} failed`);
    
    return {
      success: true,
      processed: processedCount,
      successful: successCount,
      failed: failedCount
    };

  } catch (error) {
    console.error("Fiserv payment status check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to check Fiserv payment status"
    );
  }
});

// Expire old Fiserv transactions (45 minutes timeout)
Parse.Cloud.define("expireOldFiservTransactions", async (request) => {
  try {
    console.log("🕐 Starting Fiserv transaction expiration check...");

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 45); // 45 minutes ago

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Fiserv");
    query.equalTo("status", 1); // pending
    query.lessThan("createdAt", cutoffTime);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Fiserv transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // expired
        transaction.set("expiredAt", new Date());
        await transaction.save(null, { useMasterKey: true });
        expiredCount++;
        console.log(`⏰ Expired transaction ${transaction.id}`);
      } catch (error) {
        console.error(`Error expiring transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Fiserv expiration completed: ${expiredCount} transactions expired`);
    
    return {
      success: true,
      expired: expiredCount
    };

  } catch (error) {
    console.error("Fiserv transaction expiration error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to expire Fiserv transactions"
    );
  }
});

// Create Fiserv Checkout
Parse.Cloud.define("fiservCreateCheckout", async (request) => {
  const { 
    amount, 
    currency = "USD", 
    orderId, 
    expiryHours = 24,
    customerInfo = {},
    successUrl,
    failureUrl
  } = request.params;

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  if (!amount || amount <= 0) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Valid amount is required."
    );
  }

  if (!successUrl || !failureUrl) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Success URL and Failure URL are required."
    );
  }

  try {
    const merchantTransactionId = generateMerchantTransactionId(request.user.id);
    const finalOrderId = orderId || `ORDER-${Date.now()}`;
    
    // Calculate expiry date
    const expiryDateTime = new Date();
    expiryDateTime.setHours(expiryDateTime.getHours() + expiryHours);

    // Validate required environment variables
    const requiredEnvVars = ['FISERV_STORE_ID', 'FISERV_API_KEY', 'FISERV_SECRET_KEY', 'FISERV_API_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          `${envVar} environment variable is required`
        );
      }
    }

    // Prepare checkout request body
    const requestBody = {
      storeId: process.env.FISERV_STORE_ID,
      merchantTransactionId: merchantTransactionId,
      transactionOrigin: "ECOM",
      transactionType: "SALE",
      transactionAmount: {
        total: parseFloat(amount),
        currency: currency,
        components: {
          subtotal: parseFloat(amount)
        }
      },
      order: {
        orderId: finalOrderId,
        orderDetails: {
          customerId: request.user.id,
          invoiceNumber: `INV-${Date.now()}`
        },
        ...(customerInfo.name || customerInfo.email || customerInfo.phone ? {
          billing: {
            person: {
              name: customerInfo.name || null,
              firstName: customerInfo.firstName || null,
              lastName: customerInfo.lastName || null
            },
            contact: {
              email: customerInfo.email || null,
              phone: customerInfo.phone || null
            },
            ...(customerInfo.address && {
              address: {
                address1: customerInfo.address.address1 || null,
                city: customerInfo.address.city || null,
                region: customerInfo.address.region || null,
                postalCode: customerInfo.address.postalCode || null,
                country: customerInfo.address.country || "US"
              }
            })
          }
        } : {})
      },
      checkoutSettings: {
        locale: "en_US",
        webHooksUrl: `${process.env.FRONTEND_URL}/api/fiserv-webhook`,
        redirectBackUrls: {
          successUrl: successUrl,
          failureUrl: failureUrl
        }
      },
      paymentMethodDetails: {
        cards: {
          authenticationPreferences: {
            challengeIndicator: "01",
            skipTra: false
          },
          createToken: {
            declineDuplicateToken: false,
            reusable: true,
            toBeUsedFor: "UNSCHEDULED"
          },
          tokenBasedTransaction: {
            transactionSequence: "FIRST"
          }
        }
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateFiservHeaders(bodyString);

    // Make API call to Fiserv
    const response = await fetch(`${process.env.FISERV_API_URL}/checkouts`, {
      method: 'POST',
      headers: headers,
      body: bodyString
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv Checkout API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const fiservResponse = await response.json();
    console.log('✅ Fiserv checkout created:', fiservResponse);

    // Save transaction record
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionRecords();
    
    transactionDetails.set("userId", request.user.id);
    transactionDetails.set("transactionAmount", parseFloat(amount));
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("status", 1); // pending
    transactionDetails.set("type", "recharge");
    transactionDetails.set("portal", "FiservCheckout");
    transactionDetails.set("transactionIdFromStripe", fiservResponse.checkout.checkoutId);
    transactionDetails.set("paymentMethod", "Fiserv Checkout");
    transactionDetails.set("userParentId", request.user.get("userParentId") || "");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("orderId", finalOrderId);
    transactionDetails.set("expiryDateTime", expiryDateTime);

    // Add game ID if available
    const gameId = process.env.GAME_ID || "786";
    transactionDetails.set("gameId", gameId);

    await transactionDetails.save(null, { useMasterKey: true });

    return {
      success: true,
      checkout: fiservResponse.checkout,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      orderId: finalOrderId,
      expiryDateTime: expiryDateTime.toISOString()
    };

  } catch (error) {
    console.error("Fiserv checkout creation error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to create Fiserv checkout"
    );
  }
});

// Get Fiserv Checkout Details
Parse.Cloud.define("fiservGetCheckoutDetails", async (request) => {
  const { checkoutId } = request.params;

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  if (!checkoutId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Checkout ID is required."
    );
  }

  try {
    const headers = generateFiservHeaders();

    // Make API call to get checkout details
    const response = await fetch(`${process.env.FISERV_API_URL}/checkouts/${checkoutId}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv Checkout Details API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const checkoutDetails = await response.json();
    console.log('✅ Fiserv checkout details retrieved:', checkoutDetails);

    return {
      success: true,
      checkout: checkoutDetails
    };

  } catch (error) {
    console.error("Fiserv checkout details error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to get Fiserv checkout details"
    );
  }
});

// Check Fiserv Checkout Status and Update Balance
Parse.Cloud.define("checkFiservCheckoutsRecharge", async (request) => {
  try {
    console.log("🔄 Starting Fiserv checkout status check...");

    // Find pending Fiserv checkout transactions
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    
    query.equalTo("status", 1); // pending
    query.equalTo("portal", "FiservCheckout");
    query.equalTo("type", "recharge");
    query.exists("transactionIdFromStripe"); // must have checkout ID
    query.limit(50); // process in batches
    query.descending("updatedAt");

    const pendingTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${pendingTransactions.length} pending Fiserv checkout transactions`);

    let processedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        const checkoutId = transaction.get("transactionIdFromStripe");
        if (!checkoutId) {
          console.log(`⚠️ No checkout ID for transaction ${transaction.id}`);
          continue;
        }

        // Get checkout details from Fiserv
        const headers = generateFiservHeaders();
        const response = await fetch(`${process.env.FISERV_API_URL}/checkouts/${checkoutId}`, {
          method: 'GET',
          headers: headers
        });

        if (!response.ok) {
          console.log(`❌ Fiserv API error for transaction ${transaction.id}: ${response.status}`);
          continue;
        }

        const fiservData = await response.json();
        const transactionStatus = fiservData.transactionStatus;
        const transactionResult = fiservData.ipgTransactionDetails?.transactionResult;

        console.log(`🔍 Transaction ${transaction.id} status: ${transactionStatus}, result: ${transactionResult}`);

        if (transactionStatus === "APPROVED" && transactionResult === "APPROVED") {
          // Payment successful - update pot balance
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");
          
          console.log(`💰 Processing successful payment for user ${userId}: $${amount}`);
          
          const balanceResult = await updatePotBalance(userId, amount);
          
          if (balanceResult.success) {
            transaction.set("status", 2); // completed
            transaction.set("fiservTransactionResult", transactionResult);
            transaction.set("fiservApprovalCode", fiservData.ipgTransactionDetails?.approvalCode);
            transaction.set("processedAt", new Date());
            
            await transaction.save(null, { useMasterKey: true });
            
            console.log(`✅ Transaction ${transaction.id} completed successfully`);
            successfulCount++;
          } else {
            console.log(`❌ Failed to update balance for transaction ${transaction.id}: ${balanceResult.error}`);
            failedCount++;
          }
        } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus)) {
          // Payment failed
          transaction.set("status", 9); // failed
          transaction.set("fiservTransactionResult", transactionResult);
          transaction.set("fiservFailureReason", fiservData.transactionFailure?.reason);
          transaction.set("processedAt", new Date());
          
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Transaction ${transaction.id} failed with status: ${transactionStatus}`);
          failedCount++;
        }
        // For INITIATED, WAITING, PARTIAL - keep as pending

        processedCount++;
      } catch (error) {
        console.error(`Error processing checkout transaction ${transaction.id}:`, error);
        failedCount++;
      }
    }

    console.log(`🏁 Fiserv checkout check completed: ${processedCount} processed, ${successfulCount} successful, ${failedCount} failed`);
    
    return {
      success: true,
      processed: processedCount,
      successful: successfulCount,
      failed: failedCount
    };

  } catch (error) {
    console.error("Fiserv checkout status check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to check Fiserv checkout status"
    );
  }
});

// Expire Old Fiserv Checkout Transactions
Parse.Cloud.define("expireOldFiservCheckoutTransactions", async (request) => {
  try {
    console.log("🕐 Starting Fiserv checkout transaction expiration check...");

    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    
    // Find transactions older than 45 minutes that are still pending
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 45); // 45 minutes ago
    
    query.equalTo("portal", "FiservCheckout");
    query.equalTo("status", 1); // Pending
    query.lessThan("createdAt", cutoffTime);
    query.limit(1000); // Max batch size

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Fiserv checkout transactions`);

    let expiredCount = 0;
    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // expired
        transaction.set("expiredAt", new Date());
        await transaction.save(null, { useMasterKey: true });
        expiredCount++;
        console.log(`⏰ Expired checkout transaction ${transaction.id}`);
      } catch (error) {
        console.error(`Error expiring checkout transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Fiserv checkout expiration completed: ${expiredCount} transactions expired`);
    
    return {
      success: true,
      expired: expiredCount
    };

  } catch (error) {
    console.error("Fiserv checkout transaction expiration error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to expire Fiserv checkout transactions"
    );
  }
});

module.exports = {
  generateMerchantTransactionId,
  generateHmacSignature,
  generateFiservHeaders
};
