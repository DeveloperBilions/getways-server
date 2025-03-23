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
