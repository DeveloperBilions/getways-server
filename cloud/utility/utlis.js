const getParentUserId = async (userId) => {
    try {
      const userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      userQuery.select("userParentId");
  
      const user = await userQuery.first({ useMasterKey: true });
  
      if (!user) {
        throw new Error("User not found.");
      }
  
      const parentUserId = user.get("userParentId");
      if (!parentUserId) {
        throw new Error("Parent user not found.");
      }
  
      return parentUserId;
    } catch (error) {
      console.error("Error fetching parent user ID:", error);
      throw error;
    }
  };
  
async function updatePotBalance(userId, amount, type) {
    try {
      if (!userId || !amount || amount <= 0 || !type) return;
  
      const userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      userQuery.select("potBalance");
  
      const user = await userQuery.first({ useMasterKey: true });
  
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
  
      const currentPotBalance = user.get("potBalance") || 0;
      const potChangeAmount = Math.floor(amount * 0.15);
  
      let newPotBalance;
      if (type === "redeem") {
        newPotBalance = Math.max(0, currentPotBalance - amount - potChangeAmount); // Prevent negative balance
      } else if (type === "recharge") {
        newPotBalance = currentPotBalance + amount + potChangeAmount;
      } else {
        throw new Error(`Invalid transaction type: ${type}`);
      }
  
      user.set("potBalance", newPotBalance);
      await user.save(null, { useMasterKey: true });
  
      console.log(`Updated potBalance for user ${userId}: ${newPotBalance} (${type})`);
    } catch (error) {
      console.error(`Error updating potBalance for user ${userId}: ${error.message}`);
    }
  }
  
  // Export the function so it can be used in other files
  module.exports = { getParentUserId , updatePotBalance};
  