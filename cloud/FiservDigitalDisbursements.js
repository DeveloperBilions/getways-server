/**
 * Fiserv Digital Disbursements (DDP) Integration
 * 
 * Implementation of Fiserv Digital Disbursements API for cashout functionality
 * Documentation Reference: Digital Disbursements API v1
 * 
 * Flow Steps:
 * Step 1: Create Recipient (POST /ddp/v1/recipients)
 * Step 2a: Create Public Token (POST /uCom/v1/tokens) - For card vaulting only
 * Step 2b: Create Nonce Token (POST /uCom/v1/account-tokens) - For card vaulting only
 * Step 2c: Vault Payment Method (POST /ddp/v1/recipients/{merchantCustomerId}/accounts) - For card vaulting only
 * Step 3: Create Payment/Disbursement (POST /ddp/v1/payments)
 * Step 3a: Cancel Payment (PATCH /ddp/v1/payments/{merchantTransactionId}/cancel) - Optional
 * Step 3b: Get Transaction Status (GET /ddp/v1/transactions/recipients/{merchantCustomerId}) - Optional
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

console.log('🔄 Loading FiservDigitalDisbursements.js file...');

// CONFIGURATION
const FISERV_DDP_CONFIG = {
  baseUrl: process.env.FISERV_DDP_BASE_URL || 'https://int.api.firstdata.com/ddp',
  ddpBasePath: '/v1',
  ucomBasePath: process.env.FISERV_UCOM_BASE_URL || 'https://int.api.firstdata.com/ucom',
  apiKey: process.env.COMMERCE_HUB_API_KEY || '',
  clientKey: process.env.FISERV_DDP_API_KEY || '', // Using API_KEY as client key (as per env)
  clientSecret: process.env.FISERV_DDP_API_SECRET || '',
  paymentType: process.env.FISERV_DDP_PAYMENT_TYPE || 'Gaming', // Gaming, Claims, Wages, Rewards
};

// UTILITY FUNCTIONS
function generateHMACSignature(method, requestBody = null) {
  // Step 1: Get and save the current time (in milliseconds)
  const time = new Date().getTime();
  
  // Step 2: Identify and save the request method
  const httpMethod = method.toUpperCase();
  
  console.log('🔐 Generating HMAC Signature:');
  console.log('   - Method:', httpMethod);
  console.log('   - Timestamp:', time);
  console.log('   - Client Key:', FISERV_DDP_CONFIG.clientKey ? '***' + FISERV_DDP_CONFIG.clientKey.slice(-4) : 'MISSING');
  console.log('   - Client Secret:', FISERV_DDP_CONFIG.clientSecret ? '***' + FISERV_DDP_CONFIG.clientSecret.slice(-4) : 'MISSING');
  
  // Step 3 & 4: Create raw signature (key:time)
  let rawSignature = FISERV_DDP_CONFIG.clientKey + ":" + time;
  
  // Step 5 & 6: Get payload and check if method is POST/PATCH/PUT
  if (httpMethod !== 'GET' && httpMethod !== 'DELETE' && requestBody) {
    // Convert request body to string (important!)
    const requestBodyString = typeof requestBody === 'string' 
      ? requestBody 
      : JSON.stringify(requestBody);
    
    // Step 7: Encrypt the request payload using SHA256
    const payload_digest = crypto.createHash('sha256').update(requestBodyString).digest();
    
    // Step 8: Take encrypted payload and convert to Base64 string
    const b64BodyContent = payload_digest.toString('base64');
    
    console.log('   - Request Body Length:', requestBodyString.length);
    console.log('   - Payload Hash (Base64):', b64BodyContent.slice(0, 20) + '...');
    
    // Step 9: Append Base64 encrypted payload to raw signature
    rawSignature = rawSignature + ":" + b64BodyContent;
  }
  
  console.log('   - Raw Signature:', rawSignature.slice(0, 50) + '...');
  
  // Step 10: HMAC encrypt raw signature using SHA256 against the environment secret
  const signature = crypto.createHmac('sha256', FISERV_DDP_CONFIG.clientSecret)
    .update(rawSignature)
    .digest();
  
  // Step 11: Convert encrypted raw signature to Base64 to produce final signature
  const hmacSignature = signature.toString('base64');
  
  console.log('   - Final HMAC Signature:', hmacSignature.slice(0, 20) + '...');
  
  return {
    signature: hmacSignature,
    timestamp: time
  };
}

/**
 * Generate standard headers for Fiserv DDP API calls
 */
function generateDDPHeaders(method, requestBody = null, accessToken = null) {
  const { signature, timestamp } = generateHMACSignature(method, requestBody);
  
  const headers = {
    'Content-Type': 'application/json',
    'Api-Key': FISERV_DDP_CONFIG.apiKey,
    'Timestamp': timestamp.toString(),
    'Authorization': `HMAC ${signature}`,
    'Client-Request-Id': uuidv4()
  };

  // Add access_token for vaulting operations (Step 2c)
  if (accessToken) {
    headers['access_token'] = accessToken;
  }

  console.log('📤 Request Headers:');
  console.log('   - Api-Key:', headers['Api-Key'] ? '***' + headers['Api-Key'].slice(-4) : 'MISSING');
  console.log('   - Timestamp:', headers['Timestamp']);
  console.log('   - Authorization:', headers['Authorization'].slice(0, 30) + '...');
  console.log('   - Client-Request-Id:', headers['Client-Request-Id']);

  return headers;
}

/**
 * Make API call to Fiserv DDP
 */
async function callFiservDDP(endpoint, method = 'GET', body = null, service = 'ddp', accessToken = null) {
  let url;
  if (service === 'ucom') {
    // For uCom: base already has /ucom, add /v1 + endpoint
    url = `${FISERV_DDP_CONFIG.ucomBasePath}/v1${endpoint}`;
  } else {
    // For DDP: base already has /ddp, add /v1 + endpoint
    url = `${FISERV_DDP_CONFIG.baseUrl}/v1${endpoint}`;
  }
  
  // Convert body to string for signature generation (important!)
  const bodyString = body ? JSON.stringify(body) : null;
  
  const headers = generateDDPHeaders(method, bodyString, accessToken);
  
  const options = {
    method,
    headers
  };
  
  if (bodyString && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = bodyString;
  }
  
  console.log(`📡 Calling Fiserv DDP API: ${method} ${url}`);
  
  try {
    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error('❌ Fiserv DDP API Error:', responseData);
      console.error('❌ Response Status:', response.status);
      console.error('❌ Response Headers:', response.headers);
      throw new Error(responseData.message || `API Error: ${response.status} - ${JSON.stringify(responseData)}`);
    }
    
    console.log('✅ Fiserv DDP API Success');
    return responseData;
  } catch (error) {
    console.error('❌ Fiserv DDP API Call Failed:', error);
    throw error;
  }
}

// ==================== STEP 1: CREATE RECIPIENT ====================

/**
 * Step 1: Create a Recipient
 * 
 * Create a recipient for card vaulting or payment purposes.
 * This is always the first step for any transactions.
 * 
 * POST /ddp/v1/recipients
 */
Parse.Cloud.define("fiservDDP_createRecipient", async (request) => {
  const { userData } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  try {
    // Generate unique merchantCustomerId (should be merchant's unique identifier)
    const merchantCustomerId = `USER-${request.user.id}-${Date.now()}`;
    
    const recipientPayload = {
      merchant: {
        merchantCustomerId: merchantCustomerId
      },
      recipient: {
        recipientType: "Consumer",
        firstName: userData?.firstName || request.user.get('firstName') || 'Unknown',
        lastName: userData?.lastName || request.user.get('lastName') || 'User',
        dateOfBirth: userData?.dateOfBirth || "01/01/1990",
        emailAddress: {
          type: "work",
          value: userData?.email || request.user.get('email') || request.user.get('username'),
          primary: true
        },
        phoneNumber: {
          countryCode: "USA",
          value: userData?.phone || "000-000-0000",
          type: "home",
          extension: "0000"
        },
        guest: true,
        address: {
          type: "work",
          street: userData?.address?.street || "123 Main Street",
          city: userData?.address?.city || "New York",
          stateOrProvince: userData?.address?.state || "NY",
          postalCode: userData?.address?.postalCode || "10001",
          country: "USA",
          formatted: userData?.address?.formatted || "123 Main Street, New York, NY 10001 US",
          primary: true
        }
      }
    };

    const result = await callFiservDDP('/recipients', 'POST', recipientPayload);
    
    return {
      success: true,
      recipientId: result.recipientId,
      merchantCustomerId: merchantCustomerId,
      status: result.status,
      message: "Recipient created successfully (Step 1 Complete)"
    };
  } catch (error) {
    console.error('❌ Step 1 - Create Recipient Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to create recipient: ${error.message}`);
  }
});

// ==================== STEP 2a: CREATE PUBLIC TOKEN (For Vaulting) ====================

/**
 * Step 2a: Create a Public Token
 * 
 * Generate a public key for encrypting PCI data and tokenId for subsequent calls.
 * Valid for 20 minutes.
 * Required for: Debit, ACH, Coinbase, MoneyNetwork
 * 
 * POST /uCom/v1/tokens
 */
Parse.Cloud.define("fiservDDP_createPublicToken", async (request) => {
  const { merchantCustomerId } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!merchantCustomerId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "merchantCustomerId is required.");
  }

  try {
    const tokenPayload = {
      fdCustomerId: merchantCustomerId, // Use same as merchantCustomerId for simplicity
      publicKeyRequired: true,
      anonymous: false
    };

    const result = await callFiservDDP('/tokens', 'POST', tokenPayload, 'ucom');
    
    return {
      success: true,
      tokenId: result.tokenId,
      publicKey: result.publicKey,
      expiresInSeconds: result.expiresInSeconds,
      algorithm: result.algorithm,
      message: "Public token created successfully (Step 2a Complete)"
    };
  } catch (error) {
    console.error('❌ Step 2a - Create Public Token Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to create public token: ${error.message}`);
  }
});

// ==================== STEP 2c: VAULT PAYMENT METHOD ====================

/**
 * Step 2c: Vault a Payment Method
 * 
 * Vault the payment method with EV (Enrollment Vault) token.
 * Requires tokenId from Step 2b in the access_token header.
 * 
 * POST /ddp/v1/recipients/{merchantCustomerId}/accounts
 */
Parse.Cloud.define("fiservDDP_vaultPaymentMethod", async (request) => {
  const { merchantCustomerId, nonceTokenId, tokenId } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!merchantCustomerId || !nonceTokenId || !tokenId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 
      "merchantCustomerId, nonceTokenId, and tokenId are required.");
  }

  try {
    const vaultPayload = {
      accounts: {
        token: {
          tokenId: nonceTokenId,
          tokenProvider: "UCOM"
        }
      }
    };

    // Call with tokenId in access_token header
    const result = await callFiservDDP(
      `/recipients/${merchantCustomerId}/accounts`, 
      'POST', 
      vaultPayload,
      'ddp',
      tokenId // This goes in access_token header
    );
    
    return {
      success: true,
      evToken: result.token || nonceTokenId,
      message: "Payment method vaulted successfully (Step 2c Complete)"
    };
  } catch (error) {
    console.error('❌ Step 2c - Vault Payment Method Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to vault payment method: ${error.message}`);
  }
});

// ==================== STEP 3: CREATE PAYMENT (DISBURSEMENT) ====================

/**
 * Step 3: Create a Payment/Disbursement
 * 
 * Main disbursement function supporting multiple payment methods:
 * - PayPal (email only - no vaulting required)
 * - Venmo (phone number only - no vaulting required)
 * - Debit Card (vaulting required)
 * - ACH (vaulting required)
 * - eCheck (no vaulting required)
 * 
 * POST /ddp/v1/payments
 */
Parse.Cloud.define("fiservDDP_createPayment", async (request) => {
  const { 
    merchantCustomerId,
    amount,
    paymentMethod, // 'paypal', 'venmo', 'card', 'ach', 'eCheck', etc.
    recipientData,
    evToken, // Enrollment Vault token (for vaulted methods)
    paymentDetails // Payment-specific details (email for PayPal, phone for Venmo, etc.)
  } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  // Validate required parameters
  if (!merchantCustomerId || !amount || !paymentMethod) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 
      "merchantCustomerId, amount, and paymentMethod are required.");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount.");
  }

  try {
    // Generate unique merchant transaction ID
    const merchantTransactionId = `CASHOUT-${request.user.id.slice(-6)}-${Date.now()}`;
    
    // Base payment payload
    const paymentPayload = {
      amount: {
        total: parsedAmount,
        currency: "USD"
      },
      recipient: [{
        recipientProfileInfo: {
          merchantCustomerId: merchantCustomerId,
          firstName: recipientData?.firstName || request.user.get('firstName') || 'Unknown',
          lastName: recipientData?.lastName || request.user.get('lastName') || 'User',
          recipientType: "Consumer",
          emailAddress: {
            value: recipientData?.email || request.user.get('email') || request.user.get('username'),
            type: "work",
            primary: true
          },
          phoneNumber: {
            code: 1,
            value: recipientData?.phone || "000-000-0000",
            type: "billing",
            extension: ""
          },
          address: {
            type: "work",
            street: recipientData?.address?.street || "123 Main Street",
            city: recipientData?.address?.city || "New York",
            stateOrProvince: recipientData?.address?.state || "NY",
            postalCode: recipientData?.address?.postalCode || "10001",
            country: "USA",
            formatted: recipientData?.address?.formatted || "123 Main Street, New York, NY 10001 US",
            primary: true
          }
        },
        payments: {
          amount: {
            total: parsedAmount,
            currency: "USD"
          },
          paymentType: FISERV_DDP_CONFIG.paymentType
        }
      }],
      merchantTransactionId: merchantTransactionId,
      batchNumber: `BATCH-${Date.now()}`,
      customFields: []
    };

    // Add payment method specific details
    switch (paymentMethod.toLowerCase()) {
      case 'paypal':
        // PayPal: email only, no vaulting required
        paymentPayload.recipient[0].payments.paypal = {
          emailAddress: paymentDetails?.email || recipientData?.email || request.user.get('email')
        };
        break;

      case 'venmo':
        // Venmo: phone number only, no vaulting required
        paymentPayload.recipient[0].payments.venmo = {
          phoneNumber: paymentDetails?.phone || recipientData?.phone || "000-000-0000"
        };
        break;

      case 'card':
      case 'debit':
        // Debit Card: requires vaulting (EV token)
        if (!evToken) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 
            "EV token is required for card payments. Please vault the card first.");
        }
        paymentPayload.recipient[0].payments.enrollmentVault = {
          token: evToken
        };
        break;

      case 'ach':
        // ACH: requires vaulting (EV token)
        if (!evToken) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 
            "EV token is required for ACH payments. Please vault the account first.");
        }
        paymentPayload.recipient[0].payments.enrollmentVault = {
          token: evToken
        };
        break;

      case 'echeck':
        // eCheck: account details in payment request, no vaulting required
        if (!paymentDetails?.routingNumber || !paymentDetails?.accountNumber) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 
            "Routing number and account number are required for eCheck.");
        }
        paymentPayload.recipient[0].payments.eCheck = {
          routingNumber: paymentDetails.routingNumber,
          accountNumber: paymentDetails.accountNumber,
          accountType: paymentDetails.accountType || "CHECKING"
        };
        break;

      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 
          `Unsupported payment method: ${paymentMethod}`);
    }

    const result = await callFiservDDP('/payments', 'POST', paymentPayload);
    
    // Save transaction record to Parse
    const Transaction = Parse.Object.extend("FiservDisbursements");
    const transaction = new Transaction();
    transaction.set("userId", request.user.id);
    transaction.set("merchantTransactionId", merchantTransactionId);
    transaction.set("fiservTransactionId", result.transactionId);
    transaction.set("amount", parsedAmount);
    transaction.set("paymentMethod", paymentMethod);
    transaction.set("status", result.transactionStatus || "pending");
    transaction.set("response", result);
    await transaction.save(null, { useMasterKey: true });
    
    return {
      success: true,
      transactionId: result.transactionId,
      merchantTransactionId: merchantTransactionId,
      status: result.transactionStatus,
      portalUrl: result.recipient?.[0]?.portalUrl,
      message: "Payment created successfully (Step 3 Complete)"
    };
  } catch (error) {
    console.error('❌ Step 3 - Create Payment Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to create payment: ${error.message}`);
  }
});

// ==================== STEP 3a: CANCEL PAYMENT (Optional) ====================

/**
 * Step 3a: Cancel a Payment
 * 
 * Cancel a payment transaction in progress or waiting for settlement.
 * Applicable for ACH, Coinbase, Venmo (unclaimed), PayPal (unclaimed).
 * 
 * PATCH /ddp/v1/payments/{merchantTransactionId}/cancel
 */
Parse.Cloud.define("fiservDDP_cancelPayment", async (request) => {
  const { merchantTransactionId, reason } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!merchantTransactionId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "merchantTransactionId is required.");
  }

  try {
    const cancelPayload = {
      paymentStatus: "CANCELLED",
      reversalReason: reason || "Customer requested cancellation"
    };

    const result = await callFiservDDP(
      `/payments/${merchantTransactionId}/cancel`, 
      'PATCH', 
      cancelPayload
    );
    
    // Update transaction record
    const query = new Parse.Query("FiservDisbursements");
    query.equalTo("merchantTransactionId", merchantTransactionId);
    const transaction = await query.first({ useMasterKey: true });
    
    if (transaction) {
      transaction.set("status", "cancelled");
      transaction.set("cancelledAt", new Date());
      transaction.set("cancellationReason", reason);
      await transaction.save(null, { useMasterKey: true });
    }
    
    return {
      success: true,
      message: "Payment cancelled successfully (Step 3a Complete)"
    };
  } catch (error) {
    console.error('❌ Step 3a - Cancel Payment Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to cancel payment: ${error.message}`);
  }
});

// ==================== STEP 3b: GET TRANSACTION STATUS (Optional) ====================

/**
 * Step 3b: Get Transaction Status
 * 
 * Retrieve transaction details by merchantCustomerId or merchantTransactionId.
 * 
 * GET /ddp/v1/transactions/recipients/{merchantCustomerId}
 */
Parse.Cloud.define("fiservDDP_getTransactionStatus", async (request) => {
  const { merchantCustomerId } = request.params || {};
  
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!merchantCustomerId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "merchantCustomerId is required.");
  }

  try {
    const result = await callFiservDDP(`/transactions/recipients/${merchantCustomerId}`, 'GET');
    
    return {
      success: true,
      transactions: result,
      message: "Transaction status retrieved successfully (Step 3b Complete)"
    };
  } catch (error) {
    console.error('❌ Step 3b - Get Transaction Status Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to get transaction status: ${error.message}`);
  }
});

// ==================== GET MERCHANT INFO (Optional) ====================

/**
 * Step 4: Get Merchant Info
 * 
 * Get merchant details including ledger balance, available balance, etc.
 * 
 * GET /ddp/v1/merchantInfo
 */
Parse.Cloud.define("fiservDDP_getMerchantInfo", async (request) => {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  try {
    const result = await callFiservDDP('/merchantInfo', 'GET');
    
    return {
      success: true,
      merchantInfo: result,
      message: "Merchant info retrieved successfully"
    };
  } catch (error) {
    console.error('❌ Get Merchant Info Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Failed to get merchant info: ${error.message}`);
  }
});

// ==================== COMBINED CASHOUT FLOW ====================

/**
 * Complete Cashout Flow for PayPal/Venmo (No Vaulting Required)
 * 
 * This combines Step 1 and Step 3 for payment methods that don't require vaulting.
 */
Parse.Cloud.define("fiservDDP_cashout", async (request) => {
  const { 
    amount,
    paymentMethod, // 'paypal' or 'venmo'
    email, // For PayPal
    phone, // For Venmo
    userData,
    type = "Getways",
    userId: paramUserId
  } = request.params || {};
  
  // if (!request.user) {
  //   throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  // }

  // Use paramUserId if provided, otherwise try request.user.id, fallback to timestamp
  const userIdForTransaction = paramUserId || request.user?.id || `USER-${Date.now()}`;
  const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;

  // Validate
  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!parsedAmount || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Valid amount is required.");
  }

  if (!paymentMethod || !['paypal', 'venmo'].includes(paymentMethod.toLowerCase())) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 
      "Payment method must be 'paypal' or 'venmo'.");
  }

  if (paymentMethod.toLowerCase() === 'paypal' && !email) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Email is required for PayPal.");
  }

  if (paymentMethod.toLowerCase() === 'venmo' && !phone) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Phone number is required for Venmo.");
  }

  try {
    // Step 1: Create Recipient
    console.log('📝 Step 1: Creating recipient...');
    const merchantCustomerId = `USER-${userIdForTransaction}-${Date.now()}`;
    
    const recipientPayload = {
      merchant: {
        merchantCustomerId: merchantCustomerId
      },
      recipient: {
        recipientType: "Consumer",
        firstName: userData?.firstName || user?.get('firstName') || 'Unknown',
        lastName: userData?.lastName || user?.get('lastName') || 'User',
        dateOfBirth: userData?.dateOfBirth || "01/01/1990",
        emailAddress: {
          type: "work",
          value: email || user?.get('email') || user?.get('username') || 'user@example.com',
          primary: true
        },
        phoneNumber: {
          countryCode: "USA",
          value: phone || "000-000-0000",
          type: "home",
          extension: "0000"
        },
        guest: true,
        address: {
          type: "work",
          street: userData?.address?.street || "123 Main Street",
          city: userData?.address?.city || "New York",
          stateOrProvince: userData?.address?.state || "NY",
          postalCode: userData?.address?.postalCode || "10001",
          country: "USA",
          formatted: userData?.address?.formatted || "123 Main Street, New York, NY 10001 US",
          primary: true
        }
      }
    };

    await callFiservDDP('/recipients', 'POST', recipientPayload);
    console.log('✅ Step 1 Complete: Recipient created');

    // Step 3: Create Payment
    console.log('💰 Step 3: Creating payment...');
    const merchantTransactionId = `CASHOUT-${userIdForTransaction.slice(-6)}-${Date.now()}`;
    
    const paymentPayload = {
      amount: {
        total: parsedAmount,
        currency: "USD"
      },
      recipient: [{
        recipientProfileInfo: {
          merchantCustomerId: merchantCustomerId,
          firstName: userData?.firstName || user?.get('firstName') || 'Unknown',
          lastName: userData?.lastName || user?.get('lastName') || 'User',
          recipientType: "Consumer",
          emailAddress: {
            value: email || user?.get('email') || user?.get('username') || 'user@example.com',
            type: "work",
            primary: true
          },
          phoneNumber: {
            code: 1,
            value: phone || "000-000-0000",
            type: "billing"
          },
          address: {
            type: "work",
            street: userData?.address?.street || "123 Main Street",
            city: userData?.address?.city || "New York",
            stateOrProvince: userData?.address?.state || "NY",
            postalCode: userData?.address?.postalCode || "10001",
            country: "USA",
            formatted: userData?.address?.formatted || "123 Main Street, New York, NY 10001 US",
            primary: true
          }
        },
        payments: {
          amount: {
            total: parsedAmount,
            currency: "USD"
          },
          paymentType: FISERV_DDP_CONFIG.paymentType
        }
      }],
      merchantTransactionId: merchantTransactionId,
      batchNumber: `BATCH-${Date.now()}`
    };

    // Add payment method specific details
    if (paymentMethod.toLowerCase() === 'paypal') {
      paymentPayload.recipient[0].payments.paypal = {
        emailAddress: email
      };
    } else if (paymentMethod.toLowerCase() === 'venmo') {
      paymentPayload.recipient[0].payments.venmo = {
        phoneNumber: phone
      };
    }

    const paymentResult = await callFiservDDP('/payments', 'POST', paymentPayload);
    console.log('✅ Step 3 Complete: Payment created');

    // Save transaction to Transactions table only (for AOG)
    const Transaction = Parse.Object.extend("Transactions");
    const transaction = new Transaction();
    
    transaction.set("userId", userIdForTransaction);
    transaction.set("type", "redeem"); // This is a cashout/redeem operation
    transaction.set("merchantCustomerId", merchantCustomerId);
    transaction.set("merchantTransactionId", merchantTransactionId);
    transaction.set("fiservTransactionId", paymentResult.transactionId);
    transaction.set("transactionAmount", parsedAmount);
    transaction.set("paymentMethod", paymentMethod);
    transaction.set("status", paymentResult.transactionStatus === "COMPLETED" ? 2 : 1); // 2 = success, 1 = pending
    transaction.set("portal", "FiservDDP");
    transaction.set("transactionDate", new Date());
    transaction.set("response", paymentResult);
    transaction.set("platform", "AOGCOINCLUB");
    transaction.set("gameId", "786");
    transaction.set("username", user?.get("username") || "");
    transaction.set("userParentId", user?.get("userParentId") || "");
    
    await transaction.save(null, { useMasterKey: true });

    return {
      success: true,
      transactionId: paymentResult.transactionId,
      merchantTransactionId: merchantTransactionId,
      status: paymentResult.transactionStatus,
      portalUrl: paymentResult.recipient?.[0]?.portalUrl,
      fiservTransactionId: paymentResult.transactionId,
      message: "Cashout completed successfully"
    };
  } catch (error) {
    console.error('❌ Cashout Failed:', error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Cashout failed: ${error.message}`);
  }
});

console.log('✅ FiservDigitalDisbursements.js loaded successfully');

module.exports = {
  generateHMACSignature,
  generateDDPHeaders,
  callFiservDDP,
  FISERV_DDP_CONFIG
};
