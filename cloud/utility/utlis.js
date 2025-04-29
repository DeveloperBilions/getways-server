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
      if (!userId || !amount || amount <= 0 || !type) {
        return { success: false, message: "Invalid input parameters." };
      }
  
      const userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      userQuery.select("potBalance");
  
      const user = await userQuery.first({ useMasterKey: true });
  
      if (!user) {
        return { success: false, message: `User not found: ${userId}` };
      }
  
      const currentPotBalance = user.get("potBalance") || 0;
      const potChangeAmount = Math.floor(amount * 0.15);
  
      let newPotBalance;
  
      if (type === "redeem") {
        if (currentPotBalance < amount) {
          return { success: false, message: "Insufficient balance to approve transactions." };
        } else if (currentPotBalance < 500) {
          return { success: false, message: "Your balance is too low to approve transactions." };
        } else {
          newPotBalance = currentPotBalance - amount;
        }
      } else if (type === "recharge") {
        newPotBalance = currentPotBalance + (amount - potChangeAmount);
      } else {
        return { success: false, message: `Invalid transaction type: ${type}` };
      }
  
      user.set("potBalance", newPotBalance);
      await user.save(null, { useMasterKey: true });
  
      console.log(`Updated potBalance for user ${userId}: ${newPotBalance} (${type})`);
  
      return { success: true, message: "Pot balance updated successfully.", potBalance: newPotBalance };
    } catch (error) {
      console.error(`Error updating potBalance for user ${userId}: ${error.message}`);
      return { success: false, error: true, message: error.message };
    }
  }
  
  
  // Export the function so it can be used in other files
  module.exports = { getParentUserId , updatePotBalance};
  