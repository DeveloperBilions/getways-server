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
    const User = Parse.Object.extend("_User");
    const assignedQuery = new Parse.Query(User);
    assignedQuery.exists("walletAddr");
    assignedQuery.select("walletAddr");
    const assignedUsers = await assignedQuery.find({ useMasterKey: true });
  
    const assignedWallets = new Set(assignedUsers.map(u => u.get("walletAddr")));
  
    // Step 2: Filter unassigned wallet addresses
    const unassignedWallets = csvWallets.filter(addr => !assignedWallets.has(addr));
  
    if (unassignedWallets.length === 0) {
      throw new Error("No unassigned wallet addresses available.");
    }
  
    // Step 3: Fetch target user
    const userQuery = new Parse.Query(User);
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
  