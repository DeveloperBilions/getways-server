const axios = require("axios"); // Make sure axios is installed

Parse.Cloud.define("sendCheckbookInvoice", async (request) => {
  const { email, amount, description, userId, username, userParentId } = request.params;

  if (!email || !amount || !description || !userId || !username) {
    throw new Error("Missing required fields.");
  }

  const API_URL = "https://sandbox.checkbook.io/v3/invoice";
 
    const API_AUTH = "57834abba5ef49dea102b57561a56524:zuVmx7yC0rzx7edpgSNnzL1MpbOP7i";

  //const API_AUTH = "a5e3acd961a04d5aaba30475f84f5c20:roRCkg6IkwuVhj2an2LQrzKppn93iw";

  try {
    // 1. First send invoice to Checkbook API
    const response = await axios.post(
      API_URL,
      {
        amount: amount,
        description: description,
        name: "Your Platform Name", // customize this if needed
        number: "Recharge-" + Date.now(),
        recipient: email,
      },
      {
        headers: {
          Authorization: `${API_AUTH}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const responseData = response.data; // Invoice created successfully

    // 2. Then create TransactionRecords entry
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionDetails();

    transactionDetails.set("type", "recharge");
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", username);
    transactionDetails.set("userId", userId);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", amount);
    transactionDetails.set("remark", description);
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", userParentId || "");
    transactionDetails.set("status", 1);
    transactionDetails.set("referralLink", responseData?.short_url || ""); // or responseData.url
    transactionDetails.set("transactionIdFromStripe", responseData?.id || ""); // save invoice id
    transactionDetails.set("portal", "Checkbook");

    await transactionDetails.save(null, { useMasterKey: true });

    return responseData;
  } catch (error) {
    console.error("Checkbook API error:", error.response?.data || error.message);
    throw new Error(
      `Checkbook API Error: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
});

Parse.Cloud.define("checkCheckbookInvoices", async (request) => {
  const API_BASE_URL = "https://sandbox.checkbook.io/v3/invoice/";
  const API_AUTH = "57834abba5ef49dea102b57561a56524:zuVmx7yC0rzx7edpgSNnzL1MpbOP7i";

  //const API_AUTH = "a5e3acd961a04d5aaba30475f84f5c20:roRCkg6IkwuVhj2an2LQrzKppn93iw";

  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(TransactionRecords);

  query.equalTo("status", 1); // Pending
  query.equalTo("portal", "Checkbook");
  query.limit(10000); // you can increase if needed (batch)

  const pendingInvoices = await query.find({ useMasterKey: true });

  console.log(`Found ${pendingInvoices.length} pending invoices`);

  for (const invoiceRecord of pendingInvoices) {
    try {
      const invoiceId = invoiceRecord.get("transactionIdFromStripe"); // stored previously
      if (!invoiceId) continue;

      const response = await axios.get(`${API_BASE_URL}${invoiceId}`, {
        headers: {
          Authorization: `${API_AUTH}`,
          Accept: "application/json",
        },
      });

      const invoiceData = response.data;
      const status = invoiceData?.status?.toLowerCase();
      console.log(status,"status")
      if (!status) continue;

      if (status === "voided" || status === "cancelled" || status === "failed") {
        // Invoice Failed
        invoiceRecord.set("status", 10);
      } else if (status === "expired") {
        // Invoice Expired
        invoiceRecord.set("status", 9);
      } else if (status === "paid") {
        // Invoice Paid
        invoiceRecord.set("status", 2); // ✅ if you want to mark as success (customize)
      } else {
        console.log(`Invoice ${invoiceId} still pending with status: ${status}`);
        continue; // Still pending, no need to update
      }

      await invoiceRecord.save(null, { useMasterKey: true });
      console.log(`Updated invoice ${invoiceId} with status: ${invoiceRecord.get("status")}`);
    } catch (err) {
      console.error("Error checking invoice:", err?.response?.data || err.message);
    }
  }

  return `Processed ${pendingInvoices.length} invoices.`;
});
