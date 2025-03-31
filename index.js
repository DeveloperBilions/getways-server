const express = require("express");
const jwt = require("jsonwebtoken");
const { ParseServer } = require("parse-server");
const ParseDashboard = require("parse-dashboard");
const cors = require("cors");
const { CronJob } = require("cron");
const cron = require("node-cron");
require("dotenv").config();
const app = express();
const setupSwagger = require("./cloud/swagger");

// Add CORS middleware
app.use(cors());
app.use(express.json());

setupSwagger(app);
// Parse Server initialization
async function startParseServer() {
  const parseServer = new ParseServer({
    databaseURI: process.env.DB_URL,
    cloud: "./cloud/main.js",
    serverURL: process.env.SERVER_URL,
    appId: process.env.APP_ID,
    masterKey: process.env.MASTER_KEY,
    encodeParseObjectInCloudFunction: false,
  });

  // Start Parse Server
  await parseServer.start();

  // Mount Parse Server at '/parse' URL prefix
  app.use("/parse", parseServer.app);

  // Configure Parse Dashboard (optional)
  const dashboard = new ParseDashboard({
    apps: [
      {
        serverURL: process.env.SERVER_URL,
        appId: process.env.APP_ID,
        masterKey: process.env.MASTER_KEY,
        appName: process.env.APP_NAME,
      },
    ],
    users: [
      {
        user: "admin",
        pass: "password",
      },
    ],
    // Allow insecure HTTP (for development only)
    allowInsecureHTTP: false,
  });

  // Mount Parse Dashboard at '/dashboard' URL prefix (optional)
  app.use("/dashboard", dashboard);

  // Start the server
  //const port = 1337;
  const port = 6000;

  app.listen(port, function () {
    console.log(
      `##### parse-server running on ${process.env.SERVER_URL} #####`
    );
  });

  //auth flow for AOG API
  app.post("/requestToken", (req, res) => {
    const user = { id: req.body.userid };

    const ACCESS_TOKEN_SECRET =
      "e11c6aa82db982f9fa9215e244a43a4f3e436ef4b4576766845976ab526accfed74e21ceb19265f88635c04a0222593eaca3b696ed2be5a38854f1869bfdad8e";

    const accessToken = jwt.sign(user, ACCESS_TOKEN_SECRET);
    res.json({ accessToken: accessToken });
  });

  function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.sendStatus(401);

    const ACCESS_TOKEN_SECRET =
      "e11c6aa82db982f9fa9215e244a43a4f3e436ef4b4576766845976ab526accfed74e21ceb19265f88635c04a0222593eaca3b696ed2be5a38854f1869bfdad8e";

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  }

  app.get("/posts", authenticateToken, (req, res) => {
    const posts = [
      { userid: "Em0FNBjBHc", title: "Post 1" },
      { userid: "Fm0FNBjBHc", title: "Post 2" },
    ];
    res.json(posts);
  });

  async function callReadExcelFile() {
    try {
      console.log("Calling readExcelFile cloud function...");

      // Call the cloud function directly
      const response = await Parse.Cloud.run("readExcelFile");

      console.log("Cloud function response:", response);
    } catch (error) {
      console.error("Error calling cloud function:", error.message);
    }
  }

  // Call the function
  // callReadExcelFile();

  // Runs every 30 seconds to perform rapid checks and updates on transactions:
  setInterval(async () => {
    try {
      console.log("Running cloud function every 30 seconds...");

      await Parse.Cloud.run("checkTransactionStatusStripe"); // Checks and updates transaction statuses from Stripe.
    } catch (error) {
      console.error("Error running cloud function:", error);
    }
  }, process.env.checkTransactionStatusStripe); // 30 seconds interval.

  // Runs every 10 minutes to handle potentially expired transactions:
  setInterval(async () => {
    try {
      console.log("Running cloud function every 10 minutes...");

      await Parse.Cloud.run("expiredTransactionStripe"); // Re-checks for expired transactions periodically.
    } catch (error) {
      console.error("Error running cloud function:", error);
    }
  }, process.env.expiredTransactionStripe); // 10 minutes interval.

  // Executes a single time after 5 seconds to quickly clean up or update any initial state transactions:
  setTimeout(async () => {
    try {
      //console.log("Update The Status of blank or 0 status to 1...");
      // await Parse.Cloud.run("exportAndEmailPreviousDayTransactions")
      await Parse.Cloud.run("updateTransactionStatusForBlankData"); // Updates or removes transactions with incomplete data.
      ///await Parse.Cloud.run("migration")
    } catch (error) {
      console.error("Error running cloud function:", error);
    }
  }, 5000); // 5 seconds after initialization.

  // Helper function to get the current time in a specific timezone
  function getCurrentTimeInTimezone(timezone) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return formatter.format(now);
  }

  // Schedule the cron task
  function scheduleTask() {
    const timezone = "America/New_York"; // Set your desired timezone
    const cronTime = "0 6 * * *"; // Run every day at 6:00 AM

    const job = new CronJob(
      cronTime,
      async () => {
        const currentTime = getCurrentTimeInTimezone(timezone);
        console.log(`Task started at ${currentTime} (${timezone})`);

        try {
          // Trigger the Parse Cloud function
          await Parse.Cloud.run("exportAndEmailPreviousDayTransactions");

          const completedTime = getCurrentTimeInTimezone(timezone);
          console.log(
            `Task completed successfully at ${completedTime} (${timezone})`
          );
        } catch (error) {
          console.error(`Task failed: ${error.message}`);
        }
      },
      null, // No onComplete function
      false, // Do not start immediately
      timezone // Specify the timezone
    );

    // Start the job
    job.start();

    console.log(`Cron job scheduled to run daily at 6:00 AM (${timezone}).`);
  }

  // Call the function to schedule the cron task
  scheduleTask();

  // cron.schedule(process.env.CLEANUP_REFERRAL_LINK_CRON, async () => {
  //   try {
  //     await Parse.Cloud.run("cleanupReferralLink");
  //   } catch (error) {
  //     console.error("Error executing cloud function:", error);
  //   }
  // });

  cron.schedule(process.env.EXPIRE_REDEEM_REQUEST_CRON, async () => {
    try {
      await Parse.Cloud.run("expireRedeemRequest");
    } catch (error) {
      console.error("Error executing cloud function:", error);
    }
  });
  cron.schedule("59 23 * * *", async () => {
    try {
      await Parse.Cloud.run("sendDailyTransactionEmail");
      console.log("Daily transaction email sent successfully.");
    } catch (error) {
      console.error("Error executing cloud function:", error);
    }
  }, {
    timezone: "UTC" // Ensure it runs in UTC timezone
});

}

// Call the async function to start Parse Server
startParseServer().catch((err) =>
  console.error("Error starting Parse Server:", err)
);
