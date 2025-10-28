const nodemailer = require("nodemailer");
const { generateExcelBuffer } = require("./generateExcelBuffer.js");

async function sendAgentExcelReport() {
  const excelBuffer = await generateExcelBuffer();

  const transporter = nodemailer.createTransport({
    service: "gmail", // or SMTP host
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  const recipients = [
    "priti@thebilions.com"
  ];

  await transporter.sendMail({
    from: `"Reports Bot" <${process.env.EMAIL}>`,
    to: recipients.join(","),
    subject: "Agent Summary Report",
    text: "Please find attached the latest Agent Summary Excel.",
    attachments: [
      {
        filename: `Agent_Summary_${new Date().toISOString().slice(0, 10)}.xlsx`,
        content: excelBuffer,
      },
    ],
  });

  console.log("📧 Report sent successfully");
}

module.exports = { sendAgentExcelReport };
