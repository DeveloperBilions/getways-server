Parse.Cloud.beforeSave("TransactionRecords", async (request) => {
    const transaction = request.object;
  
    const useWallet = transaction.get("useWallet");
    const userId = transaction.get("userId");
    const amount = transaction.get("transactionAmount");
  
    if (useWallet && userId && amount) {
      const walletQuery = new Parse.Query("Wallet");
      walletQuery.equalTo("userID", userId);
      const wallet = await walletQuery.first({ useMasterKey: true });
  
      if (!wallet) {
        throw new Error("Wallet not found for user.");
      }
  
      // ✅ Fetch the latest balance
      await wallet.fetch({ useMasterKey: true });
      const currentBalance = wallet.get("balance");
  
      if (currentBalance < amount) {
        throw new Error("Insufficient wallet balance.");
      }
  
      // Optional: Deduct balance here (if you want to do it inside beforeSave — not typical)
      // wallet.set("balance", currentBalance - amount);
      // await wallet.save(null, { useMasterKey: true });
    }
  });
  