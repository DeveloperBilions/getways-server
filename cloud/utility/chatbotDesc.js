const chatbotDescription = (role = "Player") => {
  if (role === "Player") {
    return `
            GETWAYS Platform Information:
                    
            General Features:
            - GETWAYS is a digital wallet and gift card management platform offering services for users to manage their funds and vouchers.
            - The platform has four main sections: Recharge, Redeem, Wallet, and Gift Card.
            - Users can add funds to their wallet, redeem cards, cash out money, and manage their gift cards.
                
            Wallet Features:
            - View available balance (dynamically displays current user balance)
            - Cashout option to withdraw funds from wallet to gift cards
            - Instant Recharge feature using wallet funds
            - Transaction history showing recent activity
            - View total number of transactions (dynamically updates based on user account)
                
            Cashout Process:
            - Access cashout feature from the Wallet section
            - Terms & Conditions apply: Valid for 6 months from date of issue and cannot be combined with other offers
            - Users must select a gift card to receive their funds during cashout
            - Search functionality to find specific gift cards
            - Multiple gift card options available
            - Pagination available when browsing gift cards (number of pages varies based on available gift cards)
            - Two-step cashout process: 1) Select amount to cashout 2) Select gift card and confirm
            - Error message displayed if no gift card is selected: "Please select a gift card to proceed"
            - Error message displayed if cashout amount is less than $15: "Cashout request should not be less than $15."
            - Error message displayed if cashout amount exceeds current balance: "Cashout amount cannot be greater than your current balance."
            - Error message displayed if cashout amount is not be negative or zero: "Cashout amount cannot be negative or 0. Please enter a valid amount."
            - Option to redirect to recharge instead during the cashout process
            - Cancel option available at any step of the cashout process
                
            Gift Card Management:
            - Total gift card tracking (dynamically displays total number of user's gift cards)
            - Available gift cards (displays current number of available cards)
            - Expired gift cards (displays current number of expired cards)
            - Cards from various merchants including Uber Eats USA, Venue 2 Spa, EA Play, and Ruby Tuesday
            - Gift card values ranging based on purchased denominations
            - Each gift card has a unique order ID for reference
            - Some gift cards have no expiry date
                
            Recharge Options:
            1. Quick Debit Recharge (Coinbase Onramp):
              - Looking for a fast and secure way to recharge? Use Quick Debit Recharge to instantly top up your account using your debit card via Coinbase. Your transaction will be safely tracked. Please ensure pop-ups are allowed in your browser!

            2. Instant Recharge (Stripe/Wallet):
              - Choose Instant Recharge for a seamless top-up experience. You can recharge via your linked Wallet or through our Payment Portal. It’s quick, safe, and perfect for verified users. Just select your method, add a note, and proceed.

            3. Standard Recharge (External Link):
              - Use Standard Recharge if you'd like to complete your payment through an external crypto platform. Simply copy your wallet address and proceed to the link we provide. This option offers flexibility, but make sure you send the exact amount to the correct wallet address to avoid delays.

            - Multiple denomination options: 10, 15, 20, 30, 40, 50, 75, 100
            - Payment portal integration with dropdown to select payment method
            - Users can add a transaction note during recharge
            - Transaction notes can be used for record keeping or custom messages
            - Recent recharge history available
            - Total transaction count dynamically displayed based on user history
                
            Redeem Process:
            - Redeem various amounts: 20, 50, 100, 200, 500
            - Service fee applies to redemptions (percentage set by system)
            - Redemptions may take up to 2 hours to process
            - Users can add a transaction note during redeem
            - Transaction notes can be used for record keeping or custom messages
            - Recent redemption history with dynamic transaction count
            - Transaction status tracking (Successful, Expired, Pending)
                
            Transaction History:
            - Detailed timestamp for all transactions (date and time)
            - Transaction status tracking
            - Transaction amounts clearly displayed
            - Recent transactions section shows last 5 transactions
                
            Account Management:
            - Secure login system
            - Account balance tracking
            - Transaction histories across all services
                
            Support Information:
            - For balance inquiries, check the Wallet section
            - For gift card issues, check the Gift Card section
            - Transaction problems can be verified in respective history sections
            - Redemption failures may take up to 2 hours to process as noted on the platform
                
            Quick Debit (Coinbase):
            - Quick Debit is a fast and secure payment method powered by Coinbase.
            - Just select Quick Debit and follow the simple on-screen steps.
            - You’ll be redirected to the Coinbase-powered interface to finish your payment.
                
            Login Process:
            - Enter your Email or Phone on the login screen.
              - If it exists → You’ll be asked to enter your password.
              - If not → Error: “User does not exist”.
            - On the password screen:
              - Correct password → You’ll be logged in.
              - Wrong password → Error: “Invalid Password”.
            - Optional: Tick “Remember me” to stay logged in on the device.
            - Players cannot sign up directly.
            - If a user enters an invalid password 5 times in a row, their account will be temporarily locked.
                - Error displayed: "Login Failed: Your account is locked due to multiple failed login attempts. Please try again after 30 min."
                
            Profile Menu Features:
            - Click the profile icon at the top right of the screen to open a dropdown menu.
            - The dropdown includes three options:
              1. Change Password – Opens a form where you can change your current password by entering your old password and the new one.
              2. Help Video – Opens a page that provides videos for help with login and sign-in. Only pre-registered users with a shared sign-in form Refferal Link from an agent can use this feature.
              3. Logout – Logs you out of your session immediately.
                
            Frequently Asked Questions:
            - How do I recharge my account? Use one of three methods: Quick Debit, Instant, or Standard Recharge.
            - How long do redemptions take? Redemptions may take up to 2 hours to process.
            - What is the service fee for redemption? A service fee applies to redemptions (check current rate in the app).
            - How can I check my available balance? Visit the Wallet section to see your current balance.
            - What gift cards do I have? Visit the Gift Card section to see all your gift cards.
            - Can I use my wallet funds to recharge? Yes, wallet funds can be used for Instant Recharge.
            - How do I view my transaction history? Each section (Recharge, Redeem, Wallet) has its own transaction history.
            - Why did my redemption expire? Redemptions may expire if not processed within the system timeframe.
            - What happens to pending transactions? Pending transactions are being processed and will update when complete.
            - How do I cash out my wallet balance? Go to the Wallet section, click Cashout, select an amount, then choose a gift card.
            - What types of gift cards are available for cashout? We offer various options including Mastercard eReward Virtual Accounts, Rainforest Cafe, and Venue gift cards.
            - How long are cashout gift cards valid? Gift cards are valid for 6 months from the date of issue.
            - Can I combine gift card offers? No, cashout gift cards cannot be combined with other offers.
            - What if I don't select a gift card during cashout? You will receive an error message asking you to select a gift card to proceed.
            - What if I try to cash out less than the minimum required amount? You will receive an error message: "Cashout request should not be less than $15."
            `;
  } else if (role === "Master-Agent") {
    return `
          GETWAYS Master Agent Information:

          General Features:
          - The Master Agent section of the GETWAYS platform is designed for overseeing Agents and Players, managing their activities, and accessing detailed records.
          - Key functionalities include User Management, Recharge Records, Redeem Records, Summary, and Profile Options.
          - Master Agents can create and manage Agents, perform actions like recharges and redeems for Players, view transaction records, export data, and monitor a combined balance of all users under them.

          Master Agent Section:

          - User Management:
            - View and manage a list of all Agents and Players under you, including User Name, Email, Parent User, User Type, and Date.
            Create a new Agent using the "Add New User" option.
            - Filter Agents and Players by Name and Username.
            - For Agents under you (accessible by clicking the "Actions" button in the table):
              - Disable Recharge - Can Disable the Recharge for the Selected Agent.
              - Recharge Limits - Can Set monthly and Daily Recharge Limits for agent.
              - Password Permission - Allow Agents to set or reset their Players' passwords.
              - Allow Creation Permission - Allow the Agent to create new Players.
              - Edit - Edit Agent details.
              - Delete - Delete Agent details.
            - For Players under you (accessible by clicking the "Actions" button in the table):
              - Redeem - Perform Redeem actions.
              - Recharge - Perform Recharge actions.
              - Wallet - View Wallet Details (in that can see availabe balance and payment methods and cashout status).
              - View Key - Can Copy Wallet Address of Player.
              - BaseScan - Access BaseScan for transaction details.
              - EtherScan - Access EtherScan for transaction details.
              - Edit - Edit Player details.
              - Delete - Delete Player details.

          - Recharge Records:
            - View a list of all Recharge Records for Agents and Players under you.
            - Filter by Account, Status, and Mode.
            - Export data in PDF and Excel formats.

          - Redeem Records:
            - View a list of all Redeem Records for Agents and Players under you.
            - Filter by Account and Status.
            - Export data in PDF and Excel formats.

          - Summary:
            - View a detailed summary with date-wise filtering.
            - Search for specific Agents or Players under you by name.
            - Summary includes:
              - Total number of users
              - Total Agents.
              - Total Recharges
              - Total Redeems 
              - Pending Recharges 
              - Failed Redeems 

              Profile Options:
            - Access the following options by selecting the profile icon in the top right:
            - Change Password: Master Agent can change their account password where popup will be shown. 
            - Recharge Limit: Set Recharge Limits for Players and Agents under you.
            - Help Videos: Watch videos to learn about Login and Sign Up processes.
            - Logout: Log out of the Master Agent account.

          - Additional Information:
            - Master Agent Balance is Shown near on top right side near to Profile icon
              The balance displayed reflects the combined balance of all Agents under you and all Players under those Agents.
            - Flow - User Management (Tab) 
              -> Add new user, Actions (Button in the Table) can perform actions like Disable Recharge, Recharge Limits, Allow Creation Permission, Edit, Delete. for agent and 
              -> for players Redeem, Recharge, Wallet, View Key, BaseScan, EtherScan, Edit, Delete.
          `;
  } else if (role === "Agent") {
    return `
          GETWAYS Agent Information:

          General Features:
          - The Agent section of the GETWAYS platform enables Agents to manage Players, oversee their transactions, and access detailed records.
          - Key functionalities include User Management, Recharge Records, Redeem Records, Summary, and Profile Options.
          - Agents can create Players, generate referral links, perform actions like recharges and redeems, view transaction records, export data, and monitor the combined balance of all Players under them.
          Agent Section:

          - User Management:
            - View and manage a list of Players under you, including User Name, Email, Parent User, User Type, and Date.
            Create Referral Link for Players. Using this link, Players can sign up and be linked to the Agent.
            Create a new Players using the "Add New User" option.
            - Filter Players by Email and Username.
            - For Players under you (accessible by clicking the "Actions" button in the table):
              - Redeem - Perform Redeem actions.
              - Recharge - Perform Recharge actions.
              - Wallet - View Wallet Details (in that can see availabe balance and payment methods and cashout status).
              - View Key - Can Copy Wallet Address of Player.
              - BaseScan - Access BaseScan for transaction details.
              - EtherScan - Access EtherScan for transaction details.
              - Edit - Edit Player details.
              - Delete - Delete Player details.

          - Recharge Records:
            - View a list of all Recharge Records for Players under you.
            - Filter by Account, Status, and Mode.
            - Export data in PDF and Excel formats.

          - Redeem Records:
            - View a list of all Redeem Records for Players under you.
            - Filter by Account and Status.
            - Export data in PDF and Excel formats.

          - Summary:
            - View a detailed summary with date-wise filtering.
            - Search for specific Players under you by name.
            - Summary includes:
              - Total number of users
              - Total Recharges
              - Total Redeems 
              - Pending Recharges 
              - Failed Redeems 

              Profile Options:
            - Access the following options by selecting the profile icon in the top right:
            - Change Password: Agent can change their account password where popup will be shown. 
            - Recharge Limit: Set Recharge Limits for Players under you.
            - Help Videos: Watch videos to learn about Login and Sign Up processes.
            - Logout: Log out of the Agent account.

          - Additional Information:
            - Agent Balance is Shown near on top right side near to Profile icon
              The balance displayed reflects the combined balance of all Players under those Agents.
            - Flow - User Management (Tab) 
              -> Add new user, Actions (Button in the Table) can perform actions like Disable Recharge, Recharge Limits, Allow Creation Permission, Edit, Delete.
              -> for players Redeem, Recharge, Wallet, View Key, BaseScan, EtherScan, Edit, Delete.
          `;
  }
};

module.exports = chatbotDescription;
