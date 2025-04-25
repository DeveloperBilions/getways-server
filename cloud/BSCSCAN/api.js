const axios = require("axios");

const getLatestUSDCTransaction = async (walletAddress) => {
  const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

  const url = `https://api.etherscan.io/api`;
  const params = {
    module: "account",
    action: "tokentx",
    address: walletAddress,
    contractaddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    sort: "desc",
    apikey: ETHERSCAN_API_KEY,
  };

  try {
    const response = await axios.get(url, { params });
    const txs = response.data.result;
    const latestIncomingTx = txs.find(
      (tx) => tx.to.toLowerCase() === walletAddress.toLowerCase()
    );
    if (latestIncomingTx) {
      const valueInUSDC = parseFloat(latestIncomingTx.value) / 1e6;
      const timestamp = new Date(
        parseInt(latestIncomingTx.timeStamp) * 1000
      ).toISOString();

      return {
        confirmed: true,
        amountUSDC: valueInUSDC,
        txHash: latestIncomingTx.hash,
        timestamp,
      };
    } else {
      return {
        confirmed: false,
        message: "No incoming USDC transaction found",
      };
    }
  } catch (err) {
    console.error("Error fetching from Etherscan:", err.message);
    return { confirmed: false, error: err.message };
  }
};

Parse.Cloud.define("verifyCryptoRecharge", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");

  const txQuery = new Parse.Query(TransactionRecords);
  txQuery.equalTo("status", 1);
  txQuery.equalTo("portal", "Stripe"); // Only USDC
  txQuery.limit(100000);
  const pendingTxs = await txQuery.find({ useMasterKey: true });

  let verifiedCount = 0;
  for (const tx of pendingTxs) {
    const userId = tx.get("userId");
    const txAmount = parseFloat(tx.get("transactionAmount"));
    const txDate = tx.get("transactionDate");

    if (!userId || !txAmount) continue;

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });
    const walletAddr = user.get("walletAddr");
    if (!walletAddr) continue;

    const now = new Date();
        const txAgeInMinutes = (now.getTime() - txDate.getTime()) / 60000;

        if (txAgeInMinutes > 15) {
          tx.set("status", 9); // Expired
          await tx.save(null, { useMasterKey: true });
          continue;
        }
    try {
      const result = await getLatestUSDCTransaction(walletAddr);
      if (result.confirmed) {
        const usdcTimestamp = result.timestamp
          ? new Date(result.timestamp)
          : null;
        const transactionHash = result.txHash;

        const timeDiffInMinutes = usdcTimestamp
          ? Math.abs((txDate.getTime() - usdcTimestamp.getTime()) / 60000)
          : null;

        // Check if this txHash was already recorded
        const existingHashQuery = new Parse.Query(TransactionRecords);
        existingHashQuery.equalTo("transactionHash", transactionHash);
        const alreadyExists = await existingHashQuery.first({
          useMasterKey: true,
        });
        if (alreadyExists) {
          console.log(`Transaction hash already verified: ${transactionHash}`);
          continue;
        }

        if (
          timeDiffInMinutes !== null &&
          timeDiffInMinutes >= 10 &&
          timeDiffInMinutes <= 15
        ) {
          tx.set("status", 2);
          tx.set("transactionHash", transactionHash);
          await tx.save(null, { useMasterKey: true });
          verifiedCount++;
        }
      }
    } catch (err) {
      console.error(`Error verifying tx for user ${userId}:`, err.message);
    }
  }

  return { message: `Verified ${verifiedCount} USDC transactions.` };
});
