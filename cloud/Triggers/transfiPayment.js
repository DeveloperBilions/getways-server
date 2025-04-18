const axios = require("axios");

Parse.Cloud.define("checkTransactionStatusTransfi", async (request) => {
  try {
    const username = process.env.TRANSFI_USERNAME;
    const password = process.env.TRANSFI_PASSWORD;
    const basicAuthHeader =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Only pending
    query.limit(1000);
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
    query.greaterThanOrEqualTo("createdAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();

    if (!results || results.length === 0) {
      console.log("No pending TransFi transactions found.");
      return;
    }

    const data = results.map((record) => record.toJSON());
    //const diffInMinutes = (now - createdAt) / (1000 * 60);
    for (const record of data) {
      try {
        const response = await axios.get(
          `https://sandbox-api.transfi.com/v2/orders/${record.transactionIdFromStripe}`,
          {
            headers: {
              accept: "application/json",
              authorization: basicAuthHeader,
            },
          }
        );

        const orderStatus = response.data.data.status;
        console.log(
          `Order ${record.transactionIdFromStripe} status: ${response.data.data.status}`
        );

        let newStatus = 1;
        if (
          orderStatus === "fund_settled" ||
          orderStatus === "completed" ||
          orderStatus === "asset_deposited"
        ) {
          newStatus = 2; // Completed
        } else if (orderStatus === "fund_failed") {
          newStatus = 10; // Failed
        } else if (
          orderStatus === "initiated" ||
          orderStatus === "fund_processing"
        ) {
            newStatus = 1; // Still pending within time        
        }

        const recordObject = results.find((rec) => rec.id === record.objectId);
        if (recordObject) {
          recordObject.set("status", newStatus);
          await recordObject.save();

          console.log(
            `TransFi transaction updated for orderId ${record.transactionIdFromStripe} with status ${newStatus}`
          );

          if (newStatus === 2) {
            const parentUserId = await getParentUserId(record.userId);
            await updatePotBalance(
              parentUserId,
              record.transactionAmount,
              "recharge"
            );
          }
        }
      } catch (err) {
        console.error(
          `TransFi API error for orderId ${record.transactionIdFromStripe}:`,
          err.response?.data || err.message
        );
      }
    }
  } catch (error) {
    console.error("Error in checking TransFi transactions:", error.message);
    return {
      status: "error",
      code: 500,
      message: error.message,
    };
  }
});
Parse.Cloud.define("checkKycStatusTransfi", async (request) => {
  try {
    const username = process.env.TRANSFI_USERNAME;
    const password = process.env.TRANSFI_PASSWORD;
    const basicAuthHeader =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    const TransfiUserInfo = Parse.Object.extend("TransfiUserInfo");
    const query = new Parse.Query(TransfiUserInfo);
    query.equalTo("kycVerified", false);
    query.notEqualTo("kycStatus", "kyc_expired");
    query.limit(1000);

    const results = await query.find({ useMasterKey: true });

    if (!results.length) {
      console.log("No unverified KYC records found.");
      return "No updates required.";
    }

    for (const record of results) {
      const email = record.get("email");

      try {
        const response = await axios.get(
          `https://sandbox-api.transfi.com/v2/kyc/user?email=${encodeURIComponent(
            email
          )}`,
          {
            headers: {
              accept: "application/json",
              authorization: basicAuthHeader,
            },
          }
        );

        const status = response.data.status;
        const reasons = response?.data?.reasons;

        console.log(`Email: ${email}, KYC Status: ${status}`);

        // ✅ Update kycStatus from TransFi response
        record.set("kycStatus", status);

        // ✅ Update kycVerified only if KYC was successful
        if (status === "kyc_success") {
          record.set("kycVerified", true);
        } else {
          record.set("kycVerified", false);
          if (reasons.length > 0) {
            const formattedReasons = reasons
              .map((r) => `${r?.label}: ${r?.description}`)
              .join("\n");
            record.set("failed_reason", formattedReasons);
          } else {
            record.set("failed_reason", "Unknown failure reason");
          }
        }

        await record.save(null, { useMasterKey: true });
        console.log(`KYC record updated for ${email}: status=${status}`);
      } catch (err) {
        console.error(
          `Failed to fetch KYC status for ${email}:`,
          err.response?.data || err.message
        );
      }
    }

    return "KYC status check completed.";
  } catch (error) {
    console.error("Error in checkKycStatusTransfi:", error.message);
    throw new Error("Internal server error.");
  }
});
Parse.Cloud.define("expireTransfiKycAfterOneHour", async (request) => {
  try {
    const TransfiUserInfo = Parse.Object.extend("TransfiUserInfo");
    const query = new Parse.Query(TransfiUserInfo);

    // Only those NOT verified
    query.equalTo("kycVerified", false);

    // Created more than 1 hour ago
    const oneHourAgo = new Date(Date.now() - 30 * 60 * 1000);
    query.lessThan("linkGeneratedAt", oneHourAgo);
    query.equalTo("kycStatus", "kyc_initiated");
    query.limit(1000);

    const results = await query.find({ useMasterKey: true });

    if (results.length === 0) {
      console.log("No KYC records to expire.");
      return "No records expired.";
    }

    for (const record of results) {
      // Set a flag like `kycExpired = true`
      record.set("kycStatus", "kyc_expired");
      record.set("failed_reason", "KYC expired after 1 hour.");
      await record.save(null, { useMasterKey: true });
    }

    return `${results.length} KYC records marked as expired.`;
  } catch (error) {
    console.error("Error in expireTransfiKycAfterOneHour:", error.message);
    throw new Error("Internal server error.");
  }
});
Parse.Cloud.define("expireOldTransfiTransactions", async (request) => {
  try {
    const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);

    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1);
    query.equalTo("type", "recharge");
    query.lessThan("createdAt", ONE_HOUR_AGO);

    const results = await query.findAll({ useMasterKey: true });

    if (!results.length) {
      console.log("No old pending TransFi transactions to expire.");
      return "No transactions expired.";
    }

    for (const record of results) {
      record.set("status", 9); // Mark as expired
      await record.save(null, { useMasterKey: true });
      console.log(`Transaction ${record.id} marked as expired.`);
    }

    return {
      message: `${results.length} pending TransFi transactions expired.`,
    };
  } catch (error) {
    console.error("Error in expiring TransFi transactions:", error);
    return {
      status: "error",
      code: 500,
      message: error.message,
    };
  }
});

async function verifyTransfiKycStatusByEmail(email) {
  const username = process.env.TRANSFI_USERNAME;
  const password = process.env.TRANSFI_PASSWORD;
  const basicAuthHeader =
    "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const TransfiUserInfo = Parse.Object.extend("TransfiUserInfo");
  const query = new Parse.Query(TransfiUserInfo);
  query.equalTo("email", email);
  const record = await query.first({ useMasterKey: true });

  if (!record) {
    throw new Error(`No user found with email: ${email}`);
  }

  try {
    const response = await axios.get(
      `https://sandbox-api.transfi.com/v2/kyc/user?email=${encodeURIComponent(email)}`,
      {
        headers: {
          accept: "application/json",
          authorization: basicAuthHeader,
        },
      }
    );

    const status = response.data.status;
    console.log(`Email: ${email}, KYC Status: ${status}`);

    // Update fields
    // record.set("kycStatus", status);
    // record.set("kycVerified", status === "kyc_success");

    // await record.save(null, { useMasterKey: true });
    console.log(`KYC record updated for ${email}`);
    return { email, status, success: true, response: response?.data };
  } catch (err) {
    console.error(
      `Failed to verify KYC for ${email}:`,
      err.response?.data || err.message
    );
    return { email, status: "error", success: false, error: err.message };
  }
}

Parse.Cloud.define("verifySingleKycEmail", async (request) => {
  const email = request.params.email;
  if (!email) throw new Error("Email is required.");

  return await verifyTransfiKycStatusByEmail(email);
});
