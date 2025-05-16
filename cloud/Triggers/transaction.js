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
  
      await wallet.fetch({ useMasterKey: true }); // Ensure fresh balance
  
      const currentBalance = wallet.get("balance");
      const amountToDeduct = parseFloat(amount);
  
      if (currentBalance < amountToDeduct) {
        throw new Error("Insufficient wallet balance.");
      }
  
      const newBalance = currentBalance - amountToDeduct;
      wallet.set("balance", newBalance);
      await wallet.save(null, { useMasterKey: true });
  
      transaction.set("status", 2); // Mark as completed
    }
  });
  