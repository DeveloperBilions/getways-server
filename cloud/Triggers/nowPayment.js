const axios = require("axios");
const { getParentUserId, updatePotBalance } = require("../utility/utlis");

Parse.Cloud.define("checkTransactionStatusNowPayments", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Only pending records
    query.limit(10000);
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000); // Last 30 min
    query.greaterThanOrEqualTo("updatedAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();

    if (!results || results.length === 0) {
      console.log("No pending NOWPayments transactions found.");
      return;
    }

    const data = results.map((record) => record.toJSON());

    // First: Get Auth Token (if required by your setup)
    const authResponse = await axios.post(`${process.env.NOWPAYMENTS_API_URL}/v1/auth`, {
      email: process.env.NOWPAYMENTS_EMAIL,
      password: process.env.NOWPAYMENTS_PASSWORD,
    });

    const authToken = authResponse.data.token;

    for (const record of data) {
      try {
        const paymentCheck = await axios.get(
          `${process.env.NOWPAYMENTS_API_URL}/v1/payment?limit=1&invoiceId=${record.transactionIdFromStripe}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
              "x-api-key": process.env.NOWPAYMENTS_API_KEY
            },
          }
        );
        const paymentData = paymentCheck.data?.data?.[0];
        const paymentStatus = paymentData?.payment_status;
        const actuallyPaid = paymentData?.actually_paid;
        //const paymentStatus = paymentCheck.data?.data?.[0]?.payment_status;
        console.log(paymentStatus,"paymentStatus",actuallyPaid)

        let newStatus = 1
        if (paymentStatus === "waiting" || paymentStatus === "confirming") {
          newStatus = 1; // Still pending
        } else if (
          paymentStatus === "confirmed" ||
          paymentStatus === "sending" ||
          paymentStatus === "partially_paid" ||
          paymentStatus === "finished"
        ) {
          newStatus = 2; // Completed
        } else if (paymentStatus === "expired") {
          newStatus = 9; // Expired
        } else if (paymentStatus === "failed" || paymentStatus === "refunded") {
          newStatus = 10; // Failed
        }

        const recordObject = results.find((rec) => rec.id === record.objectId);
        if (recordObject) {
          recordObject.set("status", newStatus);
          if (newStatus === 2 && actuallyPaid && record.transactionAmount != actuallyPaid) {
            console.log(
              `Updating transactionAmount from ${record.transactionAmount} to ${actuallyPaid}`
            );
            recordObject.set("actualTransactionAmount", record.transactionAmount);

            recordObject.set("transactionAmount", actuallyPaid);

          }

          await recordObject.save();

          console.log(
            `NOWPayments transaction updated for transactionId ${record.transactionIdFromStripe} with status ${newStatus}`
          );

          if (newStatus === 2) {
            const parentUserId = await getParentUserId(record.userId);
            await updatePotBalance(parentUserId, record.transactionAmount, "recharge");
          }
        }
      } catch (err) {
        console.error(
          `NOWPayments API error for transactionId ${record.transactionIdFromStripe}:`,
          err.message
        );
      }
    }
  } catch (error) {
    console.error("Error in checking NOWPayments transactions:", error.message);
    return {
      status: "error",
      code: 500,
      message: error.message,
    };
  }
});

Parse.Cloud.define("checkTransactionStatusTransfi", async (request) => {
  try {
    const username = process.env.TRANSFI_USERNAME;
    const password = process.env.TRANSFI_PASSWORD;
    const basicAuthHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Only pending
    query.limit(1000);
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
    query.greaterThanOrEqualTo("updatedAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();

    if (!results || results.length === 0) {
      console.log("No pending TransFi transactions found.");
      return;
    }

    const data = results.map((record) => record.toJSON());

    for (const record of data) {
      try {
        const response = await axios.get(
          `https://api.transfi.com/v2/orders/${record.transactionIdFromStripe}`,
          {
            headers: {
              accept: "application/json",
              authorization: basicAuthHeader,
            },
          }
        );

        const orderStatus = response.data.data.status;
        console.log(`Order ${record.transactionIdFromStripe} status: ${response.data.data.status}`);

        let newStatus = 1;
        if (orderStatus === "fund_settled") {
            newStatus = 2; // Completed
          } else if (orderStatus === "fund_failed") {
            newStatus = 10; // Failed
          } else if (orderStatus === "initiated" || orderStatus === "fund_processing") {
            newStatus = 1; // Still pending
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
            await updatePotBalance(parentUserId, record.transactionAmount, "recharge");
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
          `https://api.transfi.com/v2/kyc/user?email=${encodeURIComponent(email)}`,
          {
            headers: {
              accept: "application/json",
              authorization: basicAuthHeader,
            },
          }
        );

        const status = response.data.status;
        console.log(`Email: ${email}, KYC Status: ${status}`);

        // ✅ Update kycStatus from TransFi response
        record.set("kycStatus", status);

        // ✅ Update kycVerified only if KYC was successful
        if (status === "kyc_success") {
          record.set("kycVerified", true);
        } else {
          record.set("kycVerified", false);
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


Parse.Cloud.define("expireOldTransfiTransactions", async (request) => {
    try {
      const query = new Parse.Query("TransactionRecords");
      query.equalTo("status", 1); // Only pending
      query.limit(1000);
  
      const now = new Date();
      const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
  
      query.lessThan("updatedAt", halfHourAgo); // Find records older than 30 min
      const oldRecords = await query.find();
  
      if (!oldRecords || oldRecords.length === 0) {
        console.log("No pending transactions older than 30 minutes.");
        return;
      }
  
      for (const record of oldRecords) {
        record.set("status", 9); // Expire the record
        await record.save();
        console.log(`Transaction ${record.id} expired.`);
      }
  
      return { status: "success", expiredCount: oldRecords.length };
    } catch (error) {
      console.error("Error expiring old transactions:", error.message);
      return {
        status: "error",
        code: 500,
        message: error.message,
      };
    }
  });
Parse.Cloud.define("archiveTransactionrecords", async (request) => {
    const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const log = request.log;
  
    const Transactionrecords = new Parse.Query("TransactionRecords");
    Transactionrecords.lessThan("createdAt", THIRTY_DAYS_AGO);
  
    try {
      const oldRecords = await Transactionrecords.find({ useMasterKey: true });
  
      if (oldRecords.length === 0) {
        log.info("No old records found to archive.");
        return;
      }
  
      const archivedObjects = oldRecords.map((record) => {
        const archived = new Parse.Object("Transactionrecords_archive");
        archived.set("originalObjectId", record.id); // Optional for traceability
  
        // Copy all fields dynamically
        Object.keys(record.toJSON()).forEach((key) => {
          if (key !== "objectId" && key !== "createdAt" && key !== "updatedAt") {
            archived.set(key, record.get(key));
          }
        });
  
        return archived;
      });
  
      await Parse.Object.saveAll(archivedObjects, { useMasterKey: true });
      log.info(`${archivedObjects.length} records archived.`);
  
      // Delete from original class
      await Parse.Object.destroyAll(oldRecords, { useMasterKey: true });
      log.info(`${oldRecords.length} records deleted from Transactionrecords.`);
    } catch (error) {
      log.error("Archival job failed:", error);
      throw error;
    }
  });
  
  Parse.Cloud.define("archiveTransactionrecordsFirstTime", async (request) => {
    const log = request.log;
  
    try {
      const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      log.info(`Archiving records before: ${THIRTY_DAYS_AGO.toISOString()}`);
  
      // Step 1: Find old TransactionRecords
      const query = new Parse.Query("TransactionRecords");
      query.lessThan("transactionDate", THIRTY_DAYS_AGO);
      query.limit(100000); // Max per batch
  
      const oldRecords = await query.find({ useMasterKey: true });
  
      if (oldRecords.length === 0) {
        log.info("No old records to archive.");
        return;
      }
  
      // Step 2: Copy to archive
      const archiveObjects = oldRecords.map((record) => {
        const archive = new Parse.Object("Transactionrecords_archive");
  
        // Copy all fields (excluding objectId, createdAt, updatedAt)
        const data = record.toJSON();
        delete data.objectId;

        // delete data.objectId;
        // delete data.createdAt;
        // delete data.updatedAt;
       // delete data.gameId;
        Object.entries(data).forEach(([key, value]) => {
          archive.set(key, value);
          archive.set("originalCreatedAt", record.createdAt);
archive.set("originalUpdatedAt", record.updatedAt);

        });
  
        archive.set("originalObjectId", record.id); // Optional for traceability
        return archive;
      });
  
      await Parse.Object.saveAll(archiveObjects, { useMasterKey: true });
      log.info(`${archiveObjects.length} records archived.`);
  
      // Step 3: Delete originals
      await Parse.Object.destroyAll(oldRecords, { useMasterKey: true });
      log.info(`${oldRecords.length} records deleted from TransactionRecords.`);
    } catch (error) {
      log.error("Archival job failed:", error.message);
      throw error;
    }
  });
  const Stripe = require("stripe");


  
Parse.Cloud.define("getUsersFromStripeCharges", async (request) => {
  const  chargeIds = ["ch_3QwKqrLlUR10IID50C8EOQws",
  "py_3QvSZdLlUR10IID51YStlt5V",
  "ch_3Qx221LlUR10IID51sEbBUSM",
  "ch_3QrtyKLlUR10IID51N6FLsDU",
  "ch_3QpkbQLlUR10IID50uQTqfQo",
  "ch_3Quc1BLlUR10IID51oCUyt7Z",
  "ch_3QzZ64LlUR10IID5157OVkte",
  "ch_3QudHFLlUR10IID50bHyQEzg",
  "ch_3QvnYNLlUR10IID51DdAkLjf",
  "ch_3R0yfnLlUR10IID50ncu2F7e",
  "ch_3QpalwLlUR10IID50yHk5AMH",
  "ch_3QucK1LlUR10IID50FNhaUjn",
  "ch_3QpXpzLlUR10IID50rF75oLQ",
  "ch_3R0J7pLlUR10IID512q2KtwC",
  "ch_3QpiaELlUR10IID50WC1wAQr",
  "ch_3QnmNoLlUR10IID51QezK6WH",
  "ch_3Qpl7gLlUR10IID51NniMias",
  "ch_3QzXniLlUR10IID50fxw9n3d",
  "ch_3Qzmh2LlUR10IID50CE4A5vM",
  "ch_3R0IRNLlUR10IID50Cg1y8OG",
  "ch_3QthcWLlUR10IID51y3ynQhs",
  "ch_3Qn6hrLlUR10IID51Bt9MDHP",
  "ch_3QpKoBLlUR10IID50M1VxJqO",
  "ch_3Qpmx2LlUR10IID50RMZpAZz",
  "ch_3QnEuILlUR10IID51gW4ujjC",
  "ch_3QqGWRLlUR10IID51ylhhf0c",
  "ch_3Qu0SvLlUR10IID51vRbxd0b",
  "ch_3QnDftLlUR10IID50d2YO23E",
  "ch_3QvmhQLlUR10IID50FcbN4fc",
  "ch_3Qn9yxLlUR10IID5157LTzWi",
  "ch_3Qpb5ILlUR10IID51skzjfRn",
  "ch_3QnAwcLlUR10IID50tFaQuuD",
  "ch_3QzWYfLlUR10IID51Ni2Jza4",
  "ch_3QnFcwLlUR10IID50stFkxKh",
  "ch_3QsH88LlUR10IID50OAL9RPE",
  "ch_3QxQCaLlUR10IID51MQQr4g5",
  "ch_3QxPmDLlUR10IID50pybNCOF",
  "ch_3Qtms5LlUR10IID51hjPcBUN",
  "ch_3R0L6qLlUR10IID51rlEzbB2",
  "ch_3R1FWrLlUR10IID512gZG8nL",
  "ch_3QuY0bLlUR10IID51GFEq1zF",
  "ch_3QuXO7LlUR10IID51VCwhAag",
  "py_3R1DjYLlUR10IID50hVub5as",
  "py_3R1ZQsLlUR10IID51XfIod7g",
  "ch_3R1wsrLlUR10IID50lrXpJkd",
  "ch_3QxvRlLlUR10IID519E0h8VK",
  "ch_3Qy1LvLlUR10IID50zOuNkJS",
  "ch_3QxDL2LlUR10IID51xk6OM9p",
  "py_3R0LJVLlUR10IID50s7QhWYc",
  "ch_3Qwtv8LlUR10IID50NQH9FGv",
  "ch_3QxDcULlUR10IID51vBQfg5m",
  "ch_3Qxj0VLlUR10IID50Qsy9uLR",
  "py_3Queu8LlUR10IID50svMrsA7",
  "ch_3QxakELlUR10IID51dvDlPNG",
  "ch_3Qxb4pLlUR10IID50cp2ofP7",
  "ch_3QuwYvLlUR10IID50vEQpiUe",
  "ch_3QuojwLlUR10IID51WcrLQub",
  "ch_3QupEpLlUR10IID50NHWCoZc",
  "ch_3QupacLlUR10IID50IQzhQh8",
  "ch_3QvW6ILlUR10IID51JYDgACR",
  "ch_3QvivVLlUR10IID510u8uarZ",
  "ch_3Qw9zqLlUR10IID501blAAXx",
  "ch_3QxOkdLlUR10IID518BEjImW",
  "ch_3QwyfQLlUR10IID51dKV6pOE",
  "ch_3QwuoTLlUR10IID51kXNwLoo",
  "ch_3QvolZLlUR10IID51laas2Z7",
  "ch_3QxCpwLlUR10IID50SOR8apt",
  "ch_3QwvQgLlUR10IID51KcTypDM",
  "ch_3QvL2XLlUR10IID51crjiA91",
  "ch_3QvyTgLlUR10IID50gqvVl9L",
  "ch_3QwiQKLlUR10IID50S0tCNCm",
  "ch_3QwdW6LlUR10IID51GGZDcXd",
  "ch_3QvREuLlUR10IID51bGrtNHV",
  "ch_3QwJiQLlUR10IID51kAejpph",
  "ch_3Qv80fLlUR10IID51fnmJ8Xp",
  "ch_3QvxPPLlUR10IID50mDx3x09",
  "ch_3QuUXDLlUR10IID5012y9GCx",
  "ch_3QvMoSLlUR10IID50ZtfljEI",
  "ch_3QvK69LlUR10IID50R2pauqx",
  "ch_3QvIhiLlUR10IID50gjjT1Gy",
  "ch_3QvIVeLlUR10IID50J2ZFbnZ",
  "ch_3QvmFJLlUR10IID501Qlb3BP",
  "ch_3QwctPLlUR10IID514MLZg22",
  "ch_3QwrcqLlUR10IID50LmEpMHZ",
  "ch_3QwfjSLlUR10IID51FHO5g0F",
  "ch_3Quy7xLlUR10IID51sDzwHOp",
  "ch_3QwgKwLlUR10IID50LzZC5Ko",
  "py_3QwK6oLlUR10IID51HPh6xH3",
  "ch_3QxN6MLlUR10IID50qDBMiU1",
  "ch_3QxGYgLlUR10IID51MY7e63c",
  "ch_3QxNnCLlUR10IID51YLE5RvJ",
  "ch_3QxNMvLlUR10IID51acFbgVI",
  "ch_3QxNXeLlUR10IID51lSn1MH0",
  "ch_3Qu4hxLlUR10IID50Q9S5mEV",
  "ch_3QvEyoLlUR10IID50Szkyzq7",
  "ch_3QvFT1LlUR10IID51gnzL0AF",
  "ch_3QvFJiLlUR10IID508p9TiYh",
  "ch_3QvIdbLlUR10IID503MRWmN2",
  "ch_3Qu4B3LlUR10IID51yQeossD",
  "ch_3QvJmrLlUR10IID50NJyp7Ut",
  "ch_3Qu4RLLlUR10IID503TyaCkl",
  "ch_3QvIIALlUR10IID517suUrnL",
  "ch_3QvHEXLlUR10IID50wTE5Wqo",
  "ch_3QvFgFLlUR10IID51tW8fAqK",
  "ch_3QvIovLlUR10IID51RlgdO2d",
  "py_3QxZxnLlUR10IID51lJvO32y",
  "ch_3QwFZKLlUR10IID50rBn17Yx",
  "py_3QvQmDLlUR10IID50Xq54Sc9",
  "py_3QvUblLlUR10IID51xHC4r3m",
  "py_3QvnBKLlUR10IID50SpPPI0E",
  "py_3QvMW2LlUR10IID50w6zXQnC",
  "ch_3QvsMTLlUR10IID5118CuEDe",
  "ch_3QqldPLlUR10IID51lbHbrO4",
  "ch_3QsFpXLlUR10IID51Gketpyh",
  "ch_3QrbmuLlUR10IID51QRE5AWM",
  "ch_3QrWXFLlUR10IID502CUN8ck",
  "ch_3QpmSdLlUR10IID50FAlp3sh",
  "ch_3QpmBBLlUR10IID50eaMnJwp",
  "ch_3QkemvLlUR10IID51fRvcjaS",
  "ch_3QpqFgLlUR10IID50C31KTiL",
  "ch_3QppLALlUR10IID50HWrDKz0",
  "ch_3Qrd8KLlUR10IID50qVg7NmB",
  "ch_3QrVk6LlUR10IID50JbWE5bR",
  "ch_3QrczyLlUR10IID51T6Pl1lY",
  "ch_3Qrel7LlUR10IID51pEhfCHF",
  "ch_3Qpp5LLlUR10IID51IbhH166",
  "ch_3Qrf1QLlUR10IID51gdfUSuO",
  "ch_3QrX71LlUR10IID51mcMiE9l",
  "ch_3QrdtBLlUR10IID51WPqtQbY",
  "ch_3QlNMGLlUR10IID503wbeUUt",
  "ch_3QrR2aLlUR10IID51kKuqUvD",
  "ch_3Qppn3LlUR10IID51QDYhgzG",
  "ch_3Qppx5LlUR10IID51Rli73VI",
  "ch_3QrVFsLlUR10IID50NP5Kbez",
  "ch_3QrVSuLlUR10IID50K9W4yaD",
  "ch_3QpokeLlUR10IID51pQA5p2k",
  "ch_3QrbAXLlUR10IID50NfKjrmN",
  "py_3QtYEELlUR10IID51zuzbbSn",
  "ch_3QrFGELlUR10IID51uTlTZWX",
  "ch_3QqnZ2LlUR10IID51z0nSOJW",
  "ch_3QlLZyLlUR10IID51e6EyHKO",
  "ch_3Qi72DLlUR10IID50o7sp2yN",
  "ch_3QlLiGLlUR10IID50OKmOMG1",
  "ch_3Qp1gfLlUR10IID51CbdNdmu",
  "ch_3Qq9O3LlUR10IID51WG2NBXp",
  "ch_3Qq7CZLlUR10IID50haclHyP",
  "ch_3Qq8WVLlUR10IID51R0pvm51",
  "ch_3Qq9plLlUR10IID50bdoomFi",
  "ch_3QorlYLlUR10IID50rXNS6n4",
  "ch_3QqOc7LlUR10IID51Wu6MjWw",
  "ch_3Qgf3DLlUR10IID51a9gKG2X",
  "ch_3QkT0lLlUR10IID50NkWdXZp",
  "ch_3QdJ85LlUR10IID51RROI3IF",
  "ch_3QodoaLlUR10IID51PRx2vVW",
  "ch_3Qjm6rLlUR10IID519yxen8G",
  "ch_3Ql69jLlUR10IID51ye5Tr8T",
  "ch_3QkrvALlUR10IID514SjQ3uS",
  "ch_3Qkt2XLlUR10IID51baG4sg5",
  "ch_3QkuNyLlUR10IID511OT1KgA",
  "ch_3Qir3tLlUR10IID51Fi3sNy1",
  "ch_3QiroYLlUR10IID51ntB5clW",
  "ch_3QilrJLlUR10IID51ZfBY0oN",
  "ch_3QdFebLlUR10IID51LeymMmC"]

  if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
    throw new Error("Please provide an array of Stripe charge IDs.");
  }

  const results = [];

  for (const chargeId of chargeIds) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      const paymentIntentId = charge.payment_intent;

      if (!paymentIntentId) {
        results.push({ chargeId, error: "No payment intent found." });
        continue;
      }

      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      });

      const session = sessions.data[0];

      if (!session) {
        results.push({ chargeId, paymentIntentId, error: "No checkout session found." });
        continue;
      }

      const checkoutSessionId = session.id;

      const transactionQuery = new Parse.Query("TransactionRecords");
      transactionQuery.equalTo("transactionIdFromStripe", checkoutSessionId);
      transactionQuery.limit(1);

      const transaction = await transactionQuery.first({ useMasterKey: true });

      if (!transaction) {
        results.push({ chargeId, checkoutSessionId, error: "Transaction record not found." });
        continue;
      }

      const userId = transaction.get("userId");

      if (!userId) {
        results.push({ chargeId, checkoutSessionId, error: "No userId in transaction record." });
        continue;
      }

      const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });

      results.push({
        chargeId,
        checkoutSessionId,
        userId,
        username: user.get("username"),
        agent: user.get("userParentName")
      });

    } catch (err) {
      results.push({ chargeId, error: err.message });
    }
  }
  console.log(results)
  return results;
});

Parse.Cloud.define("checkRecentPendingWertTransactions", async () => {
  const THIRTY_MINUTES_AGO = new Date(Date.now() - 30 * 60 * 1000);

  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Only pending records
    query.limit(10000);
    query.greaterThanOrEqualTo("updatedAt", THIRTY_MINUTES_AGO);
    query.descending("updatedAt");

    const pendingTransactions = await query.find({ useMasterKey: true });
    const results = [];

    for (const txn of pendingTransactions) {
      const orderId = txn.get("transactionIdFromStripe");

      if (!orderId) {
        results.push({ id: txn.id, skipped: true, reason: "Missing transactionIdFromStripe" });
        continue;
      }

      try {
        const url = new URL("https://partner-sandbox.wert.io/api/external/orders");
        url.searchParams.append("search_by", "order_id");
        url.searchParams.append("order_id", orderId);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "X-API-KEY": WERT_API_KEY,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Wert API error: ${response.statusText}`);
        }

        const { data } = await response.json();
        const order = data?.[0];

        if (!order) {
          results.push({ id: txn.id, updated: false, reason: "Order not found in Wert" });
          continue;
        }

        const wertStatus = order.status;
        let newStatus = txn.get("status"); // default to existing if no match

        // 🧠 Map Wert statuses to your internal codes
        switch (wertStatus) {
          case "success":
            newStatus = 2; // success
            break;
          case "failed":
          case "cancelled":
            newStatus = 10; // failed
            break;
          case "pending":
          case "progress":
          case "created":
            newStatus = 1; // still pending
            break;
          default:
            newStatus = 9; // expired or unknown
            break;
        }

        // Only update if status has changed
        if (txn.get("status") !== newStatus) {
          txn.set("status", newStatus);
          txn.set("transactionDate", new Date(order.updated_at || Date.now()));
          await txn.save(null, { useMasterKey: true });

          results.push({ id: txn.id, updated: true, newStatus, wertStatus });
        } else {
          results.push({ id: txn.id, updated: false, wertStatus });
        }
      } catch (err) {
        console.error(`❌ Error processing txn ${txn.id}:`, err.message);
        results.push({ id: txn.id, error: err.message });
      }
    }

    return {
      processed: pendingTransactions.length,
      results,
    };
  } catch (err) {
    console.error("❌ Error in checkRecentPendingWertTransactions:", err.message);
    throw new Error("Failed to sync Wert transactions");
  }
});


