Parse.Cloud.define("assignRandomWalletAddrIfMissing", async (request) => {
    const { userId } = request.params;
    if (!userId) throw new Error("User ID is required.");
  
    const fs = require("fs");
    const path = require("path");
  
    const filePath = path.resolve(__dirname, "../../wallet.csv"); // adjust path as needed
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n").map(line => line.trim()).filter(Boolean);
    
    // Collect all wallet addresses from CSV
    const csvWallets = lines.map(line => line.replace("\r", ""));
  
    // Step 1: Get all assigned wallet addresses
    const assignedQuery = new Parse.Query(Parse.User);
    assignedQuery.exists("walletAddr");
    assignedQuery.select("walletAddr");
    assignedQuery.limit(10000);

    const assignedUsers = await assignedQuery.find({ useMasterKey: true });
  
    const assignedWallets = new Set(assignedUsers.map(u => u.get("walletAddr")));
  
    // Step 2: Filter unassigned wallet addresses
    const unassignedWallets = csvWallets.filter(addr => !assignedWallets.has(addr));
  
    if (unassignedWallets.length === 0) {
      throw new Error("No unassigned wallet addresses available.");
    }
  
    // Step 3: Fetch target user
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });
  
    if (!user) throw new Error("User not found.");
  
    const currentWallet = user.get("walletAddr");
    if (currentWallet && currentWallet.trim() !== "") {
      return { message: "User already has a wallet address assigned." };
    }
  
    // Step 4: Pick a random wallet address and assign
    const randomIndex = Math.floor(Math.random() * unassignedWallets.length);
    const selectedWallet = unassignedWallets[randomIndex];
  
    user.set("walletAddr", selectedWallet);
    await user.save(null, { useMasterKey: true });
  
    return {
      message: `Wallet address assigned: ${selectedWallet}`,
      walletAddr: selectedWallet,
      userId: userId,
    };
  });
  

  Parse.Cloud.define("assignWalletsToRecentPlayers", async (request) => {
    const fs = require("fs");
    const path = require("path");
  
    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  
      // Step 1: Query recent sessions with "Player" users who don't have a wallet
      const sessionQuery = new Parse.Query("_Session");
      sessionQuery.greaterThanOrEqualTo("updatedAt", twoMonthsAgo);
      sessionQuery.include("user");
      sessionQuery.limit(100000);
  
      const sessions = await sessionQuery.find({ useMasterKey: true });
  
      const usersToAssign = new Map();
  
      for (const session of sessions) {
        const user = session.get("user");
  
        if (
          user &&
          user.get("roleName") === "Player" &&
          !user.get("walletAddr")
        ) {
          usersToAssign.set(user.id, user);
        }
      }
  
      if (usersToAssign.size === 0) {
        return { assignedCount: 0, updatedUsers: [], message: "No users require wallet assignment." };
      }
  
      // Step 2: Load wallet.csv
      const filePath = path.resolve(__dirname, "../../wallet.csv");
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const lines = fileContent.split("\n").map(line => line.trim()).filter(Boolean);
      const csvWallets = Array.from(new Set(lines.map(line => line.replace("\r", "")))); // remove duplicates
  
      // Step 3: Get all already assigned wallet addresses
      const assignedQuery = new Parse.Query(Parse.User);
      assignedQuery.exists("walletAddr");
      assignedQuery.select("walletAddr");
      assignedQuery.limit(10000); // can paginate if needed
  
      const assignedUsers = await assignedQuery.find({ useMasterKey: true });
      const assignedWallets = new Set(assignedUsers.map(u => u.get("walletAddr")));
  
      // Step 4: Filter unassigned wallets
      const unassignedWallets = csvWallets.filter(addr => !assignedWallets.has(addr));
  
      if (unassignedWallets.length < usersToAssign.size) {
        throw new Error(`Not enough unassigned wallet addresses. Required: ${usersToAssign.size}, Available: ${unassignedWallets.length}`);
      }
  
      // Step 5: Assign wallets
      const updatedUsers = [];
      let assignedCount = 0;
  
      for (const [userId, user] of usersToAssign) {
        let selectedWallet = null;
  
        // Extra validation in case of concurrency
        while (unassignedWallets.length > 0) {
          const candidate = unassignedWallets.pop();
  
          const walletCheck = await new Parse.Query(Parse.User)
            .equalTo("walletAddr", candidate)
            .first({ useMasterKey: true });
  
          if (!walletCheck) {
            selectedWallet = candidate;
            break;
          }
        }
  
        if (!selectedWallet) {
          throw new Error("Ran out of unique wallet addresses while assigning.");
        }
  
        user.set("walletAddr", selectedWallet);
        await user.save(null, { useMasterKey: true });
  
        assignedCount++;
        updatedUsers.push({
          userId,
          username: user.get("username"),
          walletAddr: selectedWallet
        });
      }
  
      return {
        assignedCount,
        updatedUsers,
      };
  
    } catch (error) {
      throw new Error("Error assigning wallet addresses: " + error.message);
    }
  });
  