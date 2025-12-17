// SEON Fraud Detection API Integration
const axios = require("axios");

const SEON_API_KEY = process.env.SEON_API_KEY;
const SEON_API_URL =
  "https://api.us-east-1-main.seon.io/SeonRestService/fraud-api/v2/";

// Parse Cloud Function - SEON Transaction Monitoring (Payment Fraud Detection)
Parse.Cloud.define("seonFraudCheck", async (request) => {
  const {
    // User Information
    email,
    phone,
    userName,
    userId,
    firstName,
    lastName,
    userFullname,
    userCountry,
    userCity,
    userRegion,
    userZip,

    // Transaction Information
    transactionId,
    transactionType,
    transactionAmount,
    transactionCurrency,

    // Payment Information
    paymentMode,
    paymentProvider,
    cardNumber,
    cardExpiry,
    cardFullname,
    cardHash,
    cvv,
    avsResult,
    status3d,
    scaMethod,

    // Billing Information
    billingStreet,
    billingCity,
    billingRegion,
    billingZip,
    billingCountry,

    // Device & Session
    ip,
    sessionId,
    deviceId,

    // Additional
    remark,
    customFields,
  } = request.params;

  console.log("🚀 SEON Transaction Monitoring - Starting...");

  let transactionDetails;

  try {
    // Get current user
    const user =
      request.user ||
      (await new Parse.Query(Parse.User).get(userId, { useMasterKey: true }));

    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "User not found");
    }

    // ✅ Get real client IP address (handles proxies, load balancers, CDNs)
    const clientIp =
      ip ||
      request.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      request.headers?.["x-real-ip"] ||
      request.headers?.["cf-connecting-ip"] || // CloudFlare
      request.ip ||
      "0.0.0.0";

    console.log("📍 Detected Client IP Address:", clientIp);
    console.log(
      "📍 IP Source:",
      ip ? "Provided by frontend" : "Auto-detected from request"
    );

    // Create transaction record BEFORE calling SEON
    const TransactionDetails = Parse.Object.extend("TransactionDetails");
    transactionDetails = new TransactionDetails();

    const merchantTransactionId =
      transactionId ||
      `SEON_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    transactionDetails.set("type", "recharge");
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", user.get("username") || "");
    transactionDetails.set("userId", user.id);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set(
      "transactionAmount",
      parseFloat(transactionAmount) || 0
    );
    transactionDetails.set("remark", remark || "SEON Fraud Test");
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user.get("userParentId") || "");
    transactionDetails.set("status", 1); // pending
    transactionDetails.set("portal", "SEON");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set(
      "paymentMethod",
      paymentProvider || "SEON Fraud Test"
    );
    transactionDetails.set("seonTesting", true);

    await transactionDetails.save(null, { useMasterKey: true });
    console.log("✅ Transaction record created:", transactionDetails.id);

    // Extract card BIN (first 6 digits) and last 4 digits
    const cardBin = cardNumber
      ? cardNumber.replace(/\s/g, "").substring(0, 6)
      : "";
    const cardLast = cardNumber ? cardNumber.replace(/\s/g, "").slice(-4) : "";

    // Convert card expiry from MM/YY to YYYY-MM format for SEON API
    let formattedCardExpiry = "";
    if (cardExpiry) {
      const parts = cardExpiry.split("/");
      if (parts.length === 2) {
        const month = parts[0].padStart(2, "0");
        const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
        formattedCardExpiry = `${year}-${month}`;
      }
    }

    // Build SEON Transaction Monitoring payload (matching exact API spec)
    const seonPayload = {
      config: {
        ip: {
          include: "flags,history,id",
          timeout: 3000,
          version: "v1",
        },
        bin: {
          timeout: 3000,
        },
        ip_api: true,
        bin_api: !!cardBin,
        device_fingerprinting: !!sessionId,
        ignore_velocity_rules: false,
        response_fields:
          "id,state,fraud_score,ip_details,bin_details,device_details,version,applied_rules,calculation_time,seon_id",
      },
      // Action type for transaction monitoring
      action_type: "purchase",

      // Network & Device (using detected client IP)
      ip: clientIp,
      session: sessionId || "",
      device_id: deviceId || "",

      // User Information
      user_id: userId || user.id,
      user_name: userName || user.get("username") || "",
      email: email || user.get("email") || "",
      phone_number: phone || user.get("phoneNumber") || "",
      user_fullname:
        userFullname ||
        `${firstName || ""} ${lastName || ""}`.trim() ||
        user.get("name") ||
        "",
      user_country: userCountry || billingCountry || "US",
      user_city: userCity || billingCity || "",
      user_region: userRegion || billingRegion || "",
      user_zip: userZip || billingZip || "",

      // Transaction Information
      transaction_id: merchantTransactionId,
      transaction_type: transactionType || "deposit",
      transaction_amount: parseFloat(transactionAmount) || 0,
      transaction_currency: transactionCurrency || "USD",

      // Payment Information
      payment_mode: paymentMode || "credit_card",
      payment_provider: paymentProvider || "manual_entry",
      card_bin: cardBin,
      card_last: cardLast,
      card_hash: cardHash || "",
      card_fullname:
        cardFullname || `${firstName || ""} ${lastName || ""}`.trim(),
      card_expire: formattedCardExpiry,
      cvv_result: cvv ? true : false,
      avs_result: avsResult || "U",
      status_3d: status3d || "not_attempted",
      sca_method: scaMethod || "none",

      // Billing Address
      billing_street: billingStreet || "",
      billing_city: billingCity || "",
      billing_region: billingRegion || "",
      billing_zip: billingZip || "",
      billing_country: billingCountry || "US",

      // Custom Fields
      custom_fields: customFields || {
        platform: "getways",
        is_test_transaction: true,
        payment_method: "seon_fraud_check",
      },
    };

    console.log("📤 Sending to SEON Transaction Monitoring API...");

    // Call SEON API
    const response = await axios.post(SEON_API_URL, seonPayload, {
      headers: {
        "X-API-KEY": SEON_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("✅ SEON Response Received");
    console.log("📥 Fraud Score:", response.data.data.fraud_score);
    console.log("📥 State:", response.data.data.state);

    // Extract fraud detection results
    const fraudScore = response.data.data.fraud_score || 0;
    const state = response.data.data.state || "UNKNOWN";
    const appliedRules = response.data.data.applied_rules || [];

    // Get recommendation
    let recommendation = "UNKNOWN";
    if (state === "APPROVE" || fraudScore < 10) {
      recommendation = "APPROVE - Low Risk";
    } else if (state === "REVIEW" || (fraudScore >= 10 && fraudScore < 20)) {
      recommendation = "REVIEW - Medium Risk";
    } else if (state === "DECLINE" || fraudScore >= 20) {
      recommendation = "DECLINE - High Risk";
    }

    // Update transaction with SEON results
    transactionDetails.set("seonFraudScore", fraudScore);
    transactionDetails.set("seonState", state);
    transactionDetails.set("seonTransactionId", response.data.data.id);
    transactionDetails.set("seonId", response.data.data.seon_id);
    transactionDetails.set("seonRecommendation", recommendation);
    transactionDetails.set(
      "transactionIdFromStripe",
      response.data.data.id || merchantTransactionId
    );

    // Set final status based on SEON result
    if (state === "APPROVE" || fraudScore < 10) {
      transactionDetails.set("status", 2); // approved
      transactionDetails.set(
        "responseMessage",
        `SEON: Low Risk - Transaction Approved (Score: ${fraudScore})`
      );
    } else if (state === "REVIEW" || (fraudScore >= 10 && fraudScore < 20)) {
      transactionDetails.set("status", 1); // pending review
      transactionDetails.set(
        "responseMessage",
        `SEON: Medium Risk - Requires Review (Score: ${fraudScore})`
      );
    } else {
      transactionDetails.set("status", 10); // declined
      transactionDetails.set(
        "responseMessage",
        `SEON: High Risk - Transaction Declined (Score: ${fraudScore})`
      );
    }

    // Save applied rules as JSON string
    if (appliedRules.length > 0) {
      transactionDetails.set("seonAppliedRules", JSON.stringify(appliedRules));
    }

    await transactionDetails.save(null, { useMasterKey: true });
    console.log("✅ Transaction updated with SEON results");

    console.log("✅ SEON Transaction Monitoring Complete");
    console.log("🎯 Fraud Score:", fraudScore);
    console.log("🎯 State:", state);
    console.log("🎯 Recommendation:", recommendation);

    // Return pure SEON API response
    return response.data;
  } catch (error) {
    console.error("❌ SEON Transaction Monitoring Error:");
    console.error("Error Status:", error.response?.status);
    console.error("Error Data:", error.response?.data);
    console.error("Error Message:", error.message);

    // Try to update transaction as failed
    try {
      if (transactionDetails && transactionDetails.id) {
        transactionDetails.set("status", 10); // failed
        transactionDetails.set(
          "responseMessage",
          `SEON Error: ${error.message}`
        );
        transactionDetails.set("seonFraudScore", 100); // Max score on error
        transactionDetails.set("seonState", "ERROR");
        await transactionDetails.save(null, { useMasterKey: true });
      }
    } catch (updateError) {
      console.error("❌ Failed to update transaction:", updateError);
    }

    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `SEON transaction monitoring failed: ${error.message}`
    );
  }
});

// ============================================
// SEON ID VERIFICATION (IDV) - Document Scanning
// ============================================

// Create IDV session for document verification
Parse.Cloud.define("createIDVSession", async (request) => {
  const { userId, email, name } = request.params;

  try {
    const user = request.user || await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
    
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "User not found");
    }

    console.log("🆔 Creating SEON IDV Session for:", user.get("email"));

    // Generate unique reference ID for v2.0.0 SDK
    const referenceId = `user_${userId}_${Date.now()}`;

    // Save session to database
    const IDVSession = Parse.Object.extend("IDVSession");
    const sessionRecord = new IDVSession();
    sessionRecord.set("userId", user.id);
    sessionRecord.set("referenceId", referenceId);
    sessionRecord.set("email", email);
    sessionRecord.set("name", name);
    sessionRecord.set("status", "created");
    sessionRecord.set("createdAt", new Date());
    await sessionRecord.save(null, { useMasterKey: true });

    console.log("✅ IDV Session Created with referenceId:", referenceId);

    return {
      referenceId: referenceId,
      baseUrl: 'https://idv-us.seon.io',
      status: "created",
    };

  } catch (error) {
    console.error("❌ IDV Session Creation Error:", error.message);
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Failed to create IDV session: ${error.message}`
    );
  }
});

// Complete IDV session after verification
Parse.Cloud.define("completeIDVSession", async (request) => {
  const { referenceId, status } = request.params;
  const user = request.user;

  try {
    console.log("🆔 Completing IDV Session:", referenceId);
    console.log("📊 Verification Status:", status);

    // Find session record
    const IDVSession = Parse.Object.extend("IDVSession");
    const query = new Parse.Query(IDVSession);
    query.equalTo("referenceId", referenceId);
    const sessionRecord = await query.first({ useMasterKey: true });

    if (!sessionRecord) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "IDV session not found");
    }

    // Update session with results
    sessionRecord.set("status", status);
    sessionRecord.set("completedAt", new Date());
    await sessionRecord.save(null, { useMasterKey: true });

    // Update user verification status
    if (status === "success") {
      user.set("idVerified", true);
      user.set("idVerificationDate", new Date());
      user.set("idVerificationReferenceId", referenceId);
      await user.save(null, { useMasterKey: true });
      console.log("✅ User ID Verified");
    }

    return {
      success: true,
      status: status,
      verified: status === "success",
      referenceId: referenceId,
    };

  } catch (error) {
    console.error("❌ IDV Completion Error:", error.message);
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Failed to complete IDV session: ${error.message}`
    );
  }
});
