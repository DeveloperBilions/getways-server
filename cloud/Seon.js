// SEON Fraud Detection API Integration
const axios = require('axios');

const SEON_API_KEY = process.env.SEON_API_KEY;
const SEON_API_URL = 'https://api.us-east-1-main.seon.io/SeonRestService/fraud-api/v2/';

async function checkTransactionFraud(transactionData) {
  try {
    console.log("🔍 SEON Fraud Check - Starting...");
    console.log("📤 Transaction Data:", JSON.stringify(transactionData, null, 2));

    const {
      email,
      phone,
      userName,
      ip,
      cardNumber,
      cardExpiry,
      cvv,
      firstName,
      lastName,
      address,
      city,
      state,
      zip,
      country,
      amount,
      userId,
      sessionId,
      deviceId,
      paymentProvider,
      avsResult,
      status3d,
      scaMethod
    } = transactionData;

    // Extract card BIN (first 6 digits)
    const cardBin = cardNumber ? cardNumber.replace(/\s/g, '').substring(0, 6) : '';
    const cardLast = cardNumber ? cardNumber.replace(/\s/g, '').slice(-4) : '';

    // Convert card expiry from MM/YY to YYYY-MM format for SEON API
    let formattedCardExpiry = '';
    if (cardExpiry) {
      const parts = cardExpiry.split('/');
      if (parts.length === 2) {
        const month = parts[0].padStart(2, '0');
        const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
        formattedCardExpiry = `${year}-${month}`;
      }
    }

    // Build SEON request payload
    const seonPayload = {
      config: {
        ip: {
          include: "flags,history,id",
          timeout: 3000,
          version: "v1"
        },
        email: {
          timeout: 3000,
          version: "v3"
        },
        phone: {
          timeout: 3000,
          version: "v2"
        },
        bin: {
          timeout: 3000
        },
        ip_api: true,
        email_api: true,
        phone_api: true,
        bin_api: !!cardBin,
        device_fingerprinting: !!sessionId,
        ignore_velocity_rules: false,
        response_fields: "id,state,fraud_score,ip_details,email_details,phone_details,bin_details,device_details,version,applied_rules,calculation_time,seon_id"
      },
      action_type: "purchase",
      ip: ip || "0.0.0.0",
      email: email || "",
      phone_number: phone || "",
      user_id: userId || "",
      user_name: userName || "",
      user_fullname: `${firstName || ''} ${lastName || ''}`.trim(),
      user_firstname: firstName || "",
      user_lastname: lastName || "",
      user_country: country || "US",
      user_city: city || "",
      user_region: state || "",
      user_zip: zip || "",
      transaction_id: `TXN_${Date.now()}`,
      transaction_type: "deposit",
      transaction_amount: parseFloat(amount) || 0,
      transaction_currency: "USD",
      payment_mode: "credit_card",
      payment_provider: paymentProvider || "manual_entry",
      card_bin: cardBin,
      card_last: cardLast,
      card_fullname: `${firstName || ''} ${lastName || ''}`.trim(),
      card_expire: formattedCardExpiry,
      cvv_result: !!cvv,
      avs_result: avsResult || "U",
      status_3d: status3d || "not_attempted",
      sca_method: scaMethod || "none",
      billing_street: address || "",
      billing_city: city || "",
      billing_region: state || "",
      billing_zip: zip || "",
      billing_country: country || "US",
      session: sessionId || "",
      device_id: deviceId || "",
      custom_fields: {
        is_test_transaction: true,
        platform: "getways",
        payment_method: "seon_fraud_test"
      }
    };

    console.log("📤 Sending to SEON API...");

    const response = await axios.post(SEON_API_URL, seonPayload, {
      headers: {
        'X-API-KEY': SEON_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log("✅ SEON Response Received");
    console.log("📥 Fraud Score:", response.data.data.fraud_score);
    console.log("📥 State:", response.data.data.state);

    const fraudResult = {
      success: true,
      fraud_score: response.data.data.fraud_score || 0,
      state: response.data.data.state || 'UNKNOWN',
      transaction_id: response.data.data.id,
      seon_id: response.data.data.seon_id,
      applied_rules: response.data.data.applied_rules || [],
      ip_details: response.data.data.ip_details || null,
      email_details: response.data.data.email_details || null,
      phone_details: response.data.data.phone_details || null,
      bin_details: response.data.data.bin_details || null,
      device_details: response.data.data.device_details || null,
      calculation_time: response.data.data.calculation_time || 0,
      recommendation: getRecommendation(response.data.data.fraud_score, response.data.data.state),
      raw_response: response.data
    };

    console.log("✅ SEON Fraud Check Complete");
    console.log("🎯 Recommendation:", fraudResult.recommendation);

    return fraudResult;

  } catch (error) {
    console.error("❌ SEON Fraud Check Error:");
    console.error("Error Status:", error.response?.status);
    console.error("Error Data:", error.response?.data);
    console.error("Error Message:", error.message);

    return {
      success: false,
      error: error.response?.data || error.message,
      fraud_score: 100, // Max score on error (fail-safe)
      state: 'ERROR',
      recommendation: 'DECLINE - API Error'
    };
  }
}

// Get recommendation based on fraud score and state
function getRecommendation(fraudScore, state) {
  if (state === 'APPROVE' || fraudScore < 10) {
    return 'APPROVE - Low Risk';
  } else if (state === 'REVIEW' || (fraudScore >= 10 && fraudScore < 20)) {
    return 'REVIEW - Medium Risk';
  } else if (state === 'DECLINE' || fraudScore >= 20) {
    return 'DECLINE - High Risk';
  }
  return 'UNKNOWN';
}

// Parse Cloud Function - SEON Fraud Check
Parse.Cloud.define("seonFraudCheck", async (request) => {
  const {
    email,
    phone,
    userName,
    ip,
    cardNumber,
    cardExpiry,
    cvv,
    firstName,
    lastName,
    address,
    city,
    state,
    zip,
    country,
    amount,
    userId,
    remark,
    sessionId,
    deviceId,
    paymentProvider,
    avsResult,
    status3d,
    scaMethod
  } = request.params;

  console.log("🚀 SEON Fraud Check Cloud Function Called");

  try {
    // Get current user
    const user = request.user || await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "User not found");
    }

    // Create transaction record BEFORE calling SEON
    const TransactionDetails = Parse.Object.extend("TransactionDetails");
    const transactionDetails = new TransactionDetails();
    
    const merchantTransactionId = `SEON_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    transactionDetails.set("type", "recharge");
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", user.get("username") || "");
    transactionDetails.set("userId", user.id);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", parseFloat(amount));
    transactionDetails.set("remark", remark || "SEON Fraud Test");
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user.get("userParentId") || "");
    transactionDetails.set("status", 1); // pending
    transactionDetails.set("portal", "SEON");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("paymentMethod", "SEON Fraud Test");
    transactionDetails.set("seonTesting", true); // Flag as test transaction

    // Save initial transaction
    await transactionDetails.save(null, { useMasterKey: true });
    console.log("✅ Transaction record created:", transactionDetails.id);

    // Call SEON API
    const result = await checkTransactionFraud({
      email,
      phone,
      userName,
      ip: ip || request.ip, // Use request IP if not provided
      cardNumber,
      cardExpiry,
      cvv,
      firstName,
      lastName,
      address,
      city,
      state,
      zip,
      country,
      amount,
      userId: userId || user.id,
      sessionId,
      deviceId,
      paymentProvider,
      avsResult,
      status3d,
      scaMethod
    });

    // Update transaction with SEON results
    transactionDetails.set("seonFraudScore", result.fraud_score);
    transactionDetails.set("seonState", result.state);
    transactionDetails.set("seonTransactionId", result.transaction_id);
    transactionDetails.set("seonId", result.seon_id);
    transactionDetails.set("seonRecommendation", result.recommendation);
    transactionDetails.set("transactionIdFromStripe", result.transaction_id || merchantTransactionId);
    
    // Set final status based on SEON result
    if (result.state === "APPROVE" || result.fraud_score < 10) {
      transactionDetails.set("status", 2); // approved (for testing - would be 2 for real transactions)
      transactionDetails.set("responseMessage", "SEON: Low Risk - Transaction Approved");
    } else if (result.state === "REVIEW" || (result.fraud_score >= 10 && result.fraud_score < 20)) {
      transactionDetails.set("status", 1); // pending review
      transactionDetails.set("responseMessage", "SEON: Medium Risk - Requires Review");
    } else {
      transactionDetails.set("status", 10); // declined
      transactionDetails.set("responseMessage", "SEON: High Risk - Transaction Declined");
    }

    // Save applied rules as JSON string
    if (result.applied_rules && result.applied_rules.length > 0) {
      transactionDetails.set("seonAppliedRules", JSON.stringify(result.applied_rules));
    }

    // Save updated transaction
    await transactionDetails.save(null, { useMasterKey: true });
    console.log("✅ Transaction updated with SEON results");

    // Add transaction ID to response
    result.transactionRecordId = transactionDetails.id;
    result.merchantTransactionId = merchantTransactionId;

    return result;
  } catch (error) {
    console.error("❌ Cloud Function Error:", error);
    
    // Try to update transaction as failed
    try {
      if (transactionDetails && transactionDetails.id) {
        transactionDetails.set("status", 10); // failed
        transactionDetails.set("responseMessage", `SEON Error: ${error.message}`);
        await transactionDetails.save(null, { useMasterKey: true });
      }
    } catch (updateError) {
      console.error("❌ Failed to update transaction:", updateError);
    }
    
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `SEON fraud check failed: ${error.message}`);
  }
});

module.exports = {
  checkTransactionFraud,
  getRecommendation
};
