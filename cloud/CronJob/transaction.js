const stripe = require("stripe")(process.env.REACT_APP_STRIPE_KEY_PRIVATE);
const nodemailer = require("nodemailer");
const { getParentUserId, updatePotBalance } = require("../utility/utlis");

Parse.Cloud.define("checkTransactionStatusStripe", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Filter by status=1
    query.equalTo("portal", "Stripe"); // Filter by status=1
    query.limit(10000);
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago in milliseconds

    // Add a condition to fetch records updated within the last half hour
    query.greaterThanOrEqualTo("updatedAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();

    if (results != null && results.length > 0) {
      console.log("Total Pending records " + results.length);
    } else {
      console.log("No transactions found in the last 30 Seconds.");
      return; // Exit if no records are found
    }

    const data = results;

    for (const record of data) {
      const transactionId = record.get("transactionIdFromStripe");

      try {
        const session = await stripe.checkout.sessions.retrieve(
          transactionId
        );
        console.log(session)
        if (session.status === "complete") {
          record.status = 2; // Assuming 2 represents 'completed'
        } else if (session.status === "pending" || session.status === "open") {
          record.status = 1; // Pending
        } else if (session.status === "expired") {
          record.status = 9; // Expired
        } else {
          record.status = 10; // Failed or canceled
        }
        const recordObject = results.find((rec) => rec.id === record.objectId);
        if (recordObject) {
          recordObject.set("status", record.status);
          await recordObject.save();
          console.log(
            `Stripe transaction updated for orderId ${record.objectId} with status ${record.status}`
          );
          if (record.status === 2) {
            const parentUserId = await getParentUserId(record.userId);
            await updatePotBalance(
              parentUserId,
              record.transactionAmount,
              "recharge"
            );
          }
        }
      } catch (error) {
        console.error(
          `Error with Stripe API for transactionId ${record.transactionId}:`,
          error.message
        );
      }
    }
  } catch (error) {
    if (error instanceof Parse.Error) {
      console.log(`Parse-specific error: ${error.code} - ${error.message}`);
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      console.log(`An unexpected error occurred: ${error.message}`);
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});
Parse.Cloud.define("expiredTransactionStripe", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Assuming status 1 means 'initiated' or 'pending'
    query.equalTo("portal", "Stripe"); // Filter by status=1
    query.descending("updatedAt");
    query.limit(10000);

    const results = await query.find();
    console.log(`${results.length} transactions found to check with Stripe.`);

    for (const record of results) {
      const transactionId = record.get("transactionIdFromStripe");

      if (transactionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(
            transactionId
          );

          if (session && session.status) {
            let newStatus;
            if (session.status === "complete") {
              newStatus = 2; // Assuming 2 represents 'completed'
            } else if (
              session.status === "pending" ||
              session.status === "open"
            ) {
              newStatus = 1; // Pending
            } else if (session.status === "expired") {
              newStatus = 9; // Expired
            } else {
              newStatus = 10; // Failed or canceled
            }
            record.set("status", newStatus);
            await record.save();
            console.log(
              `Updated transaction record ${record.id} to status ${newStatus}`
            );
          }
        } catch (stripeError) {
          console.error(
            `Error retrieving Stripe session for transactionId ${transactionId}: ${stripeError.message}`
          );
        }
      } else {
        console.log(
          `No transaction ID found for record ${record.id}, unable to check with Stripe.`
        );
      }
    }
  } catch (error) {
    if (error instanceof Parse.Error) {
      console.log(`Parse-specific error: ${error.code} - ${error.message}`);
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      console.log(`An unexpected error occurred: ${error.message}`);
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});
Parse.Cloud.define("updateTransactionStatusForBlankData", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 0); // Filter by status=0 (initial or pending state)
    query.limit(10000);

    const results = await query.find();

    if (results.length > 0) {
      console.log(`Found ${results.length} transactions to update or remove.`);
      for (const record of results) {
        const transactionId = record.get("transactionIdFromStripe");

        if (transactionId) {
          // Assuming 'paid' on Stripe should update the record to status=1
          record.set("status", 1);
          await record.save();
          console.log(
            `Transaction updated for recordId ${record.id} with new status 1`
          );
        } else {
          // If there is no transactionId and status is 0, delete the record
          await record.destroy();
          console.log(
            `Transaction record deleted for recordId ${record.id} due to missing transactionId`
          );
        }
      }
    } else {
      console.log("No transactions found with status 0.");
    }
  } catch (error) {
    if (error instanceof Parse.Error) {
      console.log(`Parse-specific error: ${error.code} - ${error.message}`);
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      console.log(`An unexpected error occurred: ${error.message}`);
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("expireRedeemRequest", async (request) => {
  // Calculate 24 hours ago
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 6);
    query.lessThanOrEqualTo("createdAt", twentyFourHoursAgo);

    const expiredRequests = await query.find();

    for (const req of expiredRequests) {
      req.set("status", 9);
      await req.save(null, { useMasterKey: true });
    }

    return `Expired ${expiredRequests.length} redeem requests`;
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("migration", async (request) => {
  try {
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const Wallet = Parse.Object.extend("Wallet");

    // Step 1: Query transactions with type = redeem and status = 8
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("type", "redeem");
    query.equalTo("status", 8);
    query.ascending("transactionDate"); // Process oldest transactions first

    const transactions = await query.find();
    console.log(`Found ${transactions.length} transactions to migrate.`);

    const now = new Date();

    for (const transaction of transactions) {
      const userId = transaction.get("userId");
      const transactionAmount = transaction.get("transactionAmount");
      const redeemServiceFee = transaction.get("redeemServiceFee") || 0; // Redeem service fee percentage

      // Calculate the net amount after deducting the service fee
      const netAmount = Math.floor(
        transactionAmount - transactionAmount * (redeemServiceFee / 100)
      );

      // Query the user's wallet
      const walletQuery = new Parse.Query(Wallet);
      walletQuery.equalTo("userID", userId);
      let wallet = await walletQuery.first();

      // If the wallet doesn't exist, create a new one
      if (!wallet) {
        wallet = new Wallet();
        wallet.set("userID", userId);
        wallet.set("balance", 0);
        console.log(`Creating new wallet for user ${userId}`);
      }

      // Update the wallet's balance
      const currentBalance = wallet.get("balance") || 0;
      wallet.set("balance", currentBalance + netAmount);

      // Fetch the latest transaction for the user to update cashAppId
      const latestTransactionQuery = new Parse.Query(TransactionRecords);
      latestTransactionQuery.equalTo("userId", userId);
      latestTransactionQuery.descending("createdAt"); // Most recent transaction first
      const latestTransaction = await latestTransactionQuery.first();

      if (latestTransaction && latestTransaction.get("cashAppId")) {
        wallet.set("cashAppId", latestTransaction.get("cashAppId"));
      }

      // Save the wallet
      await wallet.save(null, { useMasterKey: true });

      // Update the transaction status to 6
      // transaction.set("status", 6);
      // await transaction.save(null, { useMasterKey: true });

      console.log(
        `Processed transaction ${
          transaction.id
        } for user ${userId}. Added net amount: ${netAmount}. New wallet balance: ${wallet.get(
          "balance"
        )}`
      );
    }

    // Step 2: Update transactions with status = 6 older than 24 hours
    const status6Query = new Parse.Query(TransactionRecords);
    status6Query.equalTo("status", 6);

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const oldTransactions = await status6Query.find();
    console.log(
      `Found ${oldTransactions.length} transactions with status = 6 to check.`
    );

    for (const transaction of oldTransactions) {
      const transactionDate = transaction.get("transactionDate");

      if (transactionDate < twentyFourHoursAgo) {
        transaction.set("status", 9);
        await transaction.save(null, { useMasterKey: true });
        console.log(`Updated transaction ${transaction.id} status to 9.`);
      } else {
        const userId = transaction.get("userId");

        // Check for the user's wallet
        const walletQuery = new Parse.Query(Wallet);
        walletQuery.equalTo("userID", userId);
        let wallet = await walletQuery.first();

        // Create the wallet if it doesn't exist
        if (!wallet) {
          wallet = new Wallet();
          wallet.set("userID", userId);

          // Fetch the latest transaction for the user to set cashAppId
          const latestTransactionQuery = new Parse.Query(TransactionRecords);
          latestTransactionQuery.equalTo("userId", userId);
          latestTransactionQuery.descending("createdAt"); // Most recent transaction first
          const latestTransaction = await latestTransactionQuery.first();

          if (latestTransaction && latestTransaction.get("cashAppId")) {
            wallet.set("cashAppId", latestTransaction.get("cashAppId"));
          }

          wallet.set("balance", 0); // Initialize balance
          await wallet.save(null, { useMasterKey: true });

          console.log(`Created wallet for user ${userId}`);
        }
      }
    }

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Error during migration:", error.message);
  }
});
Parse.Cloud.define("sendDailyTransactionEmail", async (request) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const queryPipeline = [
    { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
    {
      $facet: {
        totalRechargeAmount: [
          { $match: { status: { $in: [2, 3] } } },
          {
            $group: { _id: null, total: { $sum: "$transactionAmount" } },
          },
        ],
        totalRedeemAmount: [
          {
            $match: {
              type: "redeem",
              status: { $in: [4, 8] },
              transactionAmount: { $gt: 0, $type: "number" },
            },
          },
          {
            $group: { _id: null, total: { $sum: "$transactionAmount" } },
          },
        ],
        totalPendingRechargeAmount: [
          { $match: { status: 1 } },
          {
            $group: { _id: null, total: { $sum: "$transactionAmount" } },
          },
        ],
        totalCashoutRedeemsSuccess: [
          { $match: { status: 12 } },
          {
            $group: { _id: null, total: { $sum: "$transactionAmount" } },
          },
        ],
        totalCashoutRedeemsInProgress: [
          {
            $match: {
              status: 11,
              transactionAmount: { $gt: 0, $type: "number" },
            },
          },
          {
            $group: { _id: null, total: { $sum: "$transactionAmount" } },
          },
        ],
        totalRecords: [{ $count: "total" }],
        totalAmt: [
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$transactionAmount", 0] } },
            },
          },
        ],
        totalFeesCharged: [
          {
            $match: {
              type: "redeem",
              status: { $in: [4, 8] },
              transactionAmount: { $gt: 0, $type: "number" },
              redeemServiceFee: { $gt: 0, $type: "number" },
            },
          },
          {
            $project: {
              calculatedFee: {
                $floor: {
                  $multiply: [
                    { $divide: ["$redeemServiceFee", 100] },
                    "$transactionAmount",
                  ],
                },
              },
            },
          },
          {
            $group: { _id: null, total: { $sum: "$calculatedFee" } },
          },
        ],
        totalRedeemSuccessful: [{ $match: { status: 8 } }, { $count: "count" }],
        totalRechargeByType: [
          { $match: { type: "recharge", status: { $in: [2, 3] } } },
          {
            $group: {
              _id: { wallet: { $ifNull: ["$useWallet", false] } },
              totalAmount: { $sum: { $ifNull: ["$transactionAmount", 0] } },
            },
          },
          {
            $project: {
              _id: 0,
              wallet: {
                $cond: [{ $eq: ["$_id.wallet", true] }, "wallet", "others"],
              },
              totalAmount: 1,
            },
          },
        ],
        totalRedeemByTypeData: [
          { $match: { type: "redeem", status: { $in: [4, 8, 12] } } },
          {
            $project: {
              transactionId: "$id",
              amount: { $ifNull: ["$transactionAmount", 0] },
              status: 1,
              paymentType: {
                $cond: [{ $eq: ["$status", 12] }, "cashout", "redeem"],
              },
              transactionIdFromStripe: 1,
              transactionDate: 1,
              redeemServiceFee: 1,
            },
          },
        ],
        totalRechargeByTypeData: [
          { $match: { type: "recharge", status: { $in: [2, 3] } } },
          {
            $project: {
              transactionId: "$id",
              amount: { $ifNull: ["$transactionAmount", 0] },
              date: "$date",
              status: 1,
              paymentType: {
                $cond: [{ $eq: ["$useWallet", true] }, "wallet", "others"],
              },
              transactionIdFromStripe: 1,
              transactionDate: 1,
            },
          },
        ],
      },
    },
  ];

  const giftCardQuery = new Parse.Query("GiftCardHistory");
  giftCardQuery.greaterThanOrEqualTo("createdAt", today);
  giftCardQuery.lessThan("createdAt", tomorrow);
  const giftCardCount = await giftCardQuery.count({ useMasterKey: true });

  try {
    const results = await new Parse.Query("TransactionRecords").aggregate(
      queryPipeline,
      { useMasterKey: true }
    );
    const summary = results[0] || {};
    const formattedDate = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const emailContent = `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 20px;
            }
            .container {
                max-width: 600px;
                background: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                margin: auto;
            }
            .header {
                background: #ff6600;
                color: white;
                text-align: center;
                padding: 15px;
                font-size: 20px;
                border-radius: 8px 8px 0 0;
            }
            .table-container {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            .table-container th, .table-container td {
                border: 1px solid #ddd;
                padding: 10px;
                text-align: left;
            }
            .table-container th {
                background: #ff6600;
                color: white;
            }
            .highlight {
                font-weight: bold;
                color: #ff6600;
            }
            .footer {
                text-align: center;
                margin-top: 20px;
                font-size: 14px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">📊 Daily Transaction Summary</div>
            <p>Here is the latest transaction summary: 📅 ${formattedDate}</p>
            <table class="table-container">
                <tr>
                    <th>Transaction Type</th>
                    <th>Amount</th>
                </tr>
                <tr>
                    <td>Total Recharge Amount</td>
                    <td class="highlight">${
                      summary.totalRechargeAmount?.[0]?.total || 0
                    }</td>
                </tr>
                <tr>
                    <td>Total Redeem Amount</td>
                    <td class="highlight">${
                      summary.totalRedeemAmount?.[0]?.total || 0
                    }</td>
                </tr>
                <tr>
                    <td>Total Pending Recharge</td>
                    <td>${
                      summary.totalPendingRechargeAmount?.[0]?.total || 0
                    }</td>
                </tr>
                <tr>
                    <td>Total Cashout Redeems Success</td>
                    <td>${
                      summary.totalCashoutRedeemsSuccess?.[0]?.total || 0
                    }</td>
                </tr>
                <tr>
                    <td>Total Cashout Redeems In Progress</td>
                    <td>${
                      summary.totalCashoutRedeemsInProgress?.[0]?.total || 0
                    }</td>
                </tr>
                <tr>
                    <td>Total Transactions</td>
                    <td>${summary.totalRecords?.[0]?.total || 0}</td>
                </tr>
                <tr>
                    <td>Total Fees Charged</td>
                    <td>${summary.totalFeesCharged?.[0]?.total || 0}</td>
                </tr>
                <tr>
  <td>Total Gift Card Issued</td>
  <td class="highlight">${giftCardCount}</td>
</tr>

            </table>
            <p>For a detailed breakdown, please refer to the attached report.</p>
            <div class="footer">&copy; 2025 The Bilions. All rights reserved.</div>
        </div>
    </body>
    </html>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: ["viraj@bilions.co", "malhar@bilions.co", "niket@bilions.co"],
      //to:"priti@thebilions.com",
      subject: "Daily Transaction Summary",
      html: emailContent,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
});

Parse.Cloud.define("sendWalletAuditReportEmail", async () => {
  const transactionAgg = await new Parse.Query("TransactionRecords").aggregate([
    {
      $match: {
        status: { $in: [2, 3] },
        type: "recharge",
        $or: [{ useWallet: { $exists: false } }, { useWallet: false }],
      },
    },
    {
      $addFields: {
        stripeId: { $ifNull: ["$transactionIdFromStripe", ""] },
        referralLink: { $ifNull: ["$referralLink", ""] },
      },
    },
    {
      $addFields: {
        mode: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: "$stripeId", regex: "txn", options: "i" } }, then: "WERT" },
              { case: { $regexMatch: { input: "$referralLink", regex: "pay.coinbase.com", options: "i" } }, then: "CoinBase" },
              { case: { $regexMatch: { input: "$stripeId", regex: "crypto.link.com", options: "i" } }, then: "Link" },
            ],
            default: "Other",
          },
        },
      },
    },
    {
      $match: { mode: { $in: ["WERT", "CoinBase", "Link"] } },
    },
    {
      $group: {
        _id: "$userId",
        username: { $first: "$username" },
        walletAddr: { $first: "$walletAddr" },
        totalAmount: { $sum: "$transactionAmount" },
        wertTotal: {
          $sum: { $cond: [{ $eq: ["$mode", "WERT"] }, "$transactionAmount", 0] },
        },
        coinbaseTotal: {
          $sum: { $cond: [{ $eq: ["$mode", "CoinBase"] }, "$transactionAmount", 0] },
        },
        linkTotal: {
          $sum: { $cond: [{ $eq: ["$mode", "Link"] }, "$transactionAmount", 0] },
        },
      },
    },
  ], { useMasterKey: true });

  const API_KEY = process.env.ETHERSCAN_API_KEY;
  const CHAIN_ID = "8453";
  const CONTRACT_BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const LINK_CONTRACT_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const discrepancies = [];

  for (const user of transactionAgg) {
    const { walletAddr, username, coinbaseTotal = 0, linkTotal = 0 } = user;
    let baseUsdc = 0;
    let ethUsdc = 0;

    if (!walletAddr) continue;

    try {
      const res = await fetch(`https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${CONTRACT_BASE_USDC}&address=${walletAddr}&tag=latest&apikey=${API_KEY}`);
      const json = await res.json();
      baseUsdc = json?.result ? parseFloat(json.result) / 1e6 : 0;
    } catch {}

    try {
      const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokenbalance&contractaddress=${LINK_CONTRACT_ETH}&address=${walletAddr}&tag=latest&apikey=${API_KEY}`);
      const json = await res.json();
      ethUsdc = json?.result ? parseFloat(json.result) / 1e6 : 0;
    } catch {}

    const usdcBalance = baseUsdc + ethUsdc;
    const recorded = coinbaseTotal + linkTotal;
    const diff = parseFloat((usdcBalance - recorded).toFixed(2));

    if (Math.abs(diff) > 0.01) {
      discrepancies.push({
        username,
        walletAddr,
        usdcBalance: usdcBalance.toFixed(2),
        recorded: recorded.toFixed(2),
        diff: diff.toFixed(2),
      });
    }

    await delay(200); // throttle to prevent Etherscan rate-limiting
  }

  if (!discrepancies.length) {
    console.log("✅ No discrepancies found.");
    return "No balance differences found.";
  }

  // build email table
  const tableRows = discrepancies.map(d =>
    `<tr>
      <td>${d.username}</td>
      <td>${d.walletAddr}</td>
      <td>${d.recorded}</td>
      <td>${d.usdcBalance}</td>
      <td>${d.diff}</td>
    </tr>`).join("");

  const emailHTML = `
    <html>
      <body>
        <h2>🔍 Wallet Audit Discrepancy Report</h2>
        <table border="1" cellpadding="8" cellspacing="0">
          <thead>
            <tr><th>Username</th><th>Wallet</th><th>Expected</th><th>Actual</th><th>Diff</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p>Total users with discrepancy: ${discrepancies.length}</p>
      </body>
    </html>
  `;

  const nodemailer = require("nodemailer");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL,
    to:  ["viraj@bilions.co", "malhar@bilions.co", "niket@bilions.co"],
    subject: "🧾 Wallet Audit Discrepancy Report",
    html: emailHTML,
  });

  return `📩 Sent discrepancy report for ${discrepancies.length} users`;
});

Parse.Cloud.define("updateTransactionBalances", async (request) => {
  try {
    // Step 1: Fetch Master-Agent and Agent users
    const fetchMasterAgentsAndAgents = async () => {
      const userQuery = new Parse.Query(Parse.User);
      userQuery.containedIn("roleName", ["Master-Agent", "Agent"]);
      userQuery.limit(10000);
      userQuery.select("objectId", "roleName", "name", "balance", "potBalance");

      return await userQuery.find({ useMasterKey: true });
    };

    const masterAgentsAndAgents = await fetchMasterAgentsAndAgents();

    for (const masterAgentOrAgent of masterAgentsAndAgents) {
      const userId = masterAgentOrAgent.id;
      const role = masterAgentOrAgent.get("roleName");

      // Step 2: Fetch players under this Master-Agent or Agent
      const fetchPlayers = async (parentId) => {
        const playerQuery = new Parse.Query(Parse.User);
        playerQuery.equalTo("userParentId", parentId);
        playerQuery.limit(10000);
        playerQuery.select("objectId");

        const results = await playerQuery.find({ useMasterKey: true });
        return results.map((player) => player.id);
      };

      const playerIds = await fetchPlayers(userId);
      if (playerIds.length === 0) continue; // Skip if no players found

      // Step 3: Fetch total recharge amount for all players
      const fetchTotalRecharge = async () => {
        const rechargeQuery = new Parse.Query("TransactionRecords");
        rechargeQuery.containedIn("userId", playerIds);
        rechargeQuery.containedIn("status", [2, 3]);
        rechargeQuery.select("transactionAmount");

        const results = await rechargeQuery.find({ useMasterKey: true });
        return results.reduce(
          (sum, trx) => sum + (trx.get("transactionAmount") || 0),
          0
        );
      };

      const totalRechargeAmount = await fetchTotalRecharge();

      // Step 4: Fetch total redeem amount for all players
      const fetchTotalRedeem = async () => {
        const redeemQuery = new Parse.Query("TransactionRecords");
        redeemQuery.containedIn("userId", playerIds);
        redeemQuery.equalTo("type", "redeem");
        redeemQuery.containedIn("status", [4, 8]);
        redeemQuery.greaterThan("transactionAmount", 0);
        redeemQuery.select("transactionAmount");

        const results = await redeemQuery.find({ useMasterKey: true });
        return results.reduce(
          (sum, trx) => sum + (trx.get("transactionAmount") || 0),
          0
        );
      };

      const totalRedeemAmount = await fetchTotalRedeem();

      // Step 5: Deduct 15% from total recharges for pot balance (floor value)
      const potBalance = Math.floor(totalRechargeAmount * 0.15);

      // Step 6: Calculate balance for the Master-Agent or Agent (floor value)
      const balance = Math.floor(
        totalRechargeAmount - potBalance - totalRedeemAmount
      );

      // Step 7: Update balance & potBalance in User table
      masterAgentOrAgent.set("potBalance", potBalance);
      await masterAgentOrAgent.save(null, { useMasterKey: true });

      console.log(
        `Updated balance for ${role} (User ID: ${userId}): ${balance}, Pot Balance: ${potBalance}`
      );
    }

    return `Updated balances & pot balances for ${masterAgentsAndAgents.length} users in TransactionRecords and User table`;
  } catch (error) {
    throw `Error updating transaction records and user balances: ${
      error.message || error
    }`;
  }
});
