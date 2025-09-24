const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

// Reusable email sending function
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, // Use App Password
  },
});

exports.sendEmail = async (toEmail, subject, htmlContent) => {
    try {
      const mailOptions = {
        from: `THAL Security <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject,
        html: htmlContent
      };
      
      const result = await transporter.sendMail(mailOptions);
      return { success: true, messageId: result.messageId };
    } catch (err) {
      console.error('Email failed:', err);
      return { success: false, error: err.message };
    }
  };