const csv = require("csvtojson");
const fs = require("fs");
const path = require("path");

Parse.Cloud.define("assignPlayersFromCSV", async (request) => {
  console.log("🚀 Job started");
  const log = request.log;
  const csvPath = path.join(__dirname, "../../wallet.csv"); // adjust if needed

  try {
    if (!fs.existsSync(csvPath)) {
      const errorMsg = "CSV file not found at: " + csvPath;
      log.error(errorMsg);
      console.log("❌", errorMsg);
      return;
    }

    const jsonArray = await csv().fromFile(csvPath);
    const walletAddresses = jsonArray
      .map((row) => row.Address?.trim())
      .filter(Boolean); // remove empty/null

    if (walletAddresses.length === 0) {
      const msg = "⚠️ No wallet addresses found in CSV.";
      console.log(msg);
      return msg;
    }

    const query = new Parse.Query("User");
    query.equalTo("roleName", "Player");
    query.doesNotExist("userReferralCode");
    query.limit(5000); // max per batch

    let allUsers = [];
    let skip = 0;
    let batch;

    // Pagination loop (if needed)
    do {
      query.skip(skip);
      batch = await query.find({ useMasterKey: true });
      allUsers = allUsers.concat(batch);
      skip += batch.length;
    } while (batch.length === 1000);

    if (allUsers.length === 0) {
      const msg = "✅ No users matched the criteria.";
      console.log(msg);
      return msg;
    }

    allUsers.forEach((user, index) => {
        const wallet = walletAddresses[index];
        if (wallet) {
          user.set("walletAddr", wallet);
        }
      });
    await Parse.Object.saveAll(allUsers, { useMasterKey: true });

    const msg = `✅ Job complete. ${allUsers.length} users updated.`;
    console.log(msg);
    log.info(msg);
    return msg;

  } catch (error) {
    const errorMsg = `❌ Error during CSV processing: ${error.message}`;
    console.log(errorMsg);
    log.error(errorMsg);
    throw new Error(errorMsg);
  }
});

