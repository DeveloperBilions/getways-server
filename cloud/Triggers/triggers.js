const nodemailer = require("nodemailer");

Parse.Cloud.define("sendDailyTransactionSummaryIfDiscrepancy", async () => {
    try {
      const playerQuery = new Parse.Query(Parse.User);
      playerQuery.equalTo("roleName", "Player");
      playerQuery.select(["objectId", "username"]);
      const players = await playerQuery.findAll({ useMasterKey: true });
  
      if (players.length === 0) {
        return { status: "success", message: "No players found for validation." };
      }
  
      const userIdToUsername = {};
      players.forEach(player => {
        userIdToUsername[player.id] = player.get("username");
      });
  
      const userIds = players.map(player => player.id);
  
      const transactionQuery = new Parse.Query("TransactionRecords");
      transactionQuery.containedIn("userId", userIds);
  
      const pipeline = [
        { $match: { userId: { $in: userIds } } },
        {
          $group: {
            _id: "$userId",
            totalRecharge: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$type", "recharge"] }, { $in: ["$status", [2, 3]] }] },
                  "$transactionAmount",
                  0
                ]
              }
            },
            totalCashout: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$type", "cashout"] }, { $eq: ["$status", 12] }] },
                  "$transactionAmount",
                  0
                ]
              }
            },
            totalRedeem: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$type", "redeem"] }, { $in: ["$status", [4, 8]] }] },
                  "$transactionAmount",
                  0
                ]
              }
            }
          }
        }
      ];
  
      const transactionResults = await transactionQuery.aggregate(pipeline, { useMasterKey: true });
  
      const walletQuery = new Parse.Query("Wallet");
      walletQuery.containedIn("userID", userIds);
      walletQuery.select(["userId", "balance"]);
      const walletRecords = await walletQuery.find({ useMasterKey: true });
  
      const walletBalances = {};
      walletRecords.forEach(record => {
        walletBalances[record.get("userId")] = record.get("balance") || 0;
      });
  
      let discrepancies = [];
      transactionResults.forEach(record => {
        const userId = record.objectId;
        const username = userIdToUsername[userId] || userId;
        const walletBalance = walletBalances[userId] || 0;
        const totalRecharge = record.totalRecharge || 0;
        const totalCashout = record.totalCashout || 0;
        const totalRedeem = record.totalRedeem || 0;
        const expectedTotalRedeem = walletBalance + totalRecharge + totalCashout;
  
        if (totalRedeem !== expectedTotalRedeem) {
          discrepancies.push({
            username,
            walletBalance,
            totalRecharge,
            totalCashout,
            totalRedeem,
            expectedTotalRedeem,
            status: "❌ Discrepancy"
          });
        }
      });
      
      if (discrepancies.length === 0) {
        return { status: "success", message: "No discrepancies found. Email not sent." };
      }
  
      let emailContent = `
        <h2>Discrepancy Found in Daily Transaction Summary</h2>
        <table border="1" cellspacing="0" cellpadding="5">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Wallet Balance</th>
                    <th>Total Recharge</th>
                    <th>Total Cashout</th>
                    <th>Total Redeem</th>
                    <th>Expected Redeem</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>`;
  
      discrepancies.forEach((user) => {
        emailContent += `
            <tr>
                <td>${user.username}</td>
                <td>${user.walletBalance}</td>
                <td>${user.totalRecharge}</td>
                <td>${user.totalCashout}</td>
                <td>${user.totalRedeem}</td>
                <td>${user.expectedTotalRedeem}</td>
                <td>${user.status}</td>
            </tr>`;
      });
  
      emailContent += `</tbody></table>`;
  
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });
  
      const mailOptions = {
        from: process.env.EMAIL,
        to: ["priti@thebilions.com"],
        subject: "Discrepancy Found: Daily Transaction Summary",
        html: emailContent,
      };
  
      await transporter.sendMail(mailOptions);
  
      return {
        status: "success",
        message: "Discrepancy detected. Email sent successfully.",
        discrepancies
      };
  
    } catch (error) {
      console.error("Error sending daily transaction discrepancy email:", error);
      throw new Error("Failed to send email: " + error.message);
    }
});
  

