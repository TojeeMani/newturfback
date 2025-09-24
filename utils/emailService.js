const nodemailer = require('nodemailer');

// Create transporter - works both locally and on Render
const createTransporter = () => {
  // Gmail configuration (primary)
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
  
  if (emailUser && emailPass && 
      emailUser !== 'your-email@gmail.com' && 
      emailPass !== 'your-app-password' &&
      emailPass !== 'NOT SET') {
    
    console.log('✅ Using Gmail configuration for:', emailUser);
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: emailUser, 
        pass: emailPass 
      },
      tls: { rejectUnauthorized: false }
    });
  }

  // Generic SMTP configuration (fallback)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
        },
        tls: { rejectUnauthorized: false }
      });
      console.log('✅ Using SMTP configuration');
      return transporter;
    } catch (e) {
      console.warn('⚠️  SMTP config present but failed to initialize:', e.message);
    }
  }

  console.warn('⚠️  Email credentials not configured. Using development mode.');
  return null;
};

// Send OTP email
const sendOTPEmail = async (email, otp, firstName) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log('🔧 EMAIL NOT CONFIGURED - Using development mode');
      console.log('📧 Would send OTP email to:', email);
      console.log('🔑 OTP Code:', otp);
      console.log('👤 Recipient:', firstName);
      return { success: true, messageId: 'dev-mode-no-email-config', devMode: true, otp, message: 'Email not configured. Check console for OTP.' };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@turfease.local',
      to: email,
      subject: 'TurfEase - Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">TurfEase</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Email Verification</h2>
            <p style="color: #666; line-height: 1.6;">
              Hi ${firstName},
            </p>
            <p style="color: #666; line-height: 1.6;">
              Thank you for registering with TurfEase! To complete your registration, please use the following OTP:
            </p>
            <div style="background: #fff; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666; line-height: 1.6;">
              This OTP will expire in 10 minutes. If you didn't request this verification, please ignore this email.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Best regards,<br>
              The TurfEase Team
            </p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 TurfEase. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 FALLBACK - Using development mode due to email failure');
      console.log('📧 Would send OTP email to:', email);
      console.log('🔑 OTP Code:', otp);
      console.log('👤 Recipient:', firstName);
      return { success: true, messageId: 'dev-fallback-mode', devMode: true, otp, fallback: true };
    }
    return { success: false, error: error.message };
  }
};

// Send resend OTP email
const sendResendOTPEmail = async (email, otp, firstName) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log('🔧 EMAIL NOT CONFIGURED - Using development mode for resend');
      console.log('📧 Would resend OTP email to:', email);
      console.log('🔑 New OTP Code:', otp);
      console.log('👤 Recipient:', firstName);
      return { success: true, messageId: 'dev-mode-resend-no-email-config', devMode: true, otp, message: 'Email not configured. Check console for new OTP.' };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@turfease.local',
      to: email,
      subject: 'TurfEase - New Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">TurfEase</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">New Verification OTP</h2>
            <p style="color: #666; line-height: 1.6;">
              Hi ${firstName},
            </p>
            <p style="color: #666; line-height: 1.6;">
              You requested a new verification OTP. Here's your new OTP:
            </p>
            <div style="background: #fff; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666; line-height: 1.6;">
              This OTP will expire in 10 minutes. If you didn't request this verification, please ignore this email.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Best regards,<br>
              The TurfEase Team
            </p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 TurfEase. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Resend OTP email sending failed:', error);
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 FALLBACK - Using development mode for resend due to email failure');
      console.log('📧 Would resend OTP email to:', email);
      console.log('🔑 New OTP Code:', otp);
      console.log('👤 Recipient:', firstName);
      return { success: true, messageId: 'dev-fallback-resend', devMode: true, otp, fallback: true };
    }
    return { success: false, error: error.message };
  }
};

// Generic send email function
const sendEmail = async ({ email, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      // In dev/no-config, don't fail booking flows; log instead
      console.log('🔧 EMAIL NOT CONFIGURED - Simulating send');
      console.log('📧 To:', email);
      console.log('📋 Subject:', subject);
      return { success: true, messageId: 'dev-simulated-send', devMode: true };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@turfease.local',
      to: email,
      subject,
      html,
      text
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    // Never block flows due to email; indicate soft failure
    return { success: false, error: error.message };
  }
};

// Send owner approval email
const sendOwnerApprovalEmail = async (email, firstName, businessName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'TurfEase - Account Approved! Welcome to TurfEase',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">TurfEase</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #10b981; margin-bottom: 20px;">🎉 Account Approved!</h2>
            <p style="color: #666; line-height: 1.6;">
              Hi ${firstName},
            </p>
            <p style="color: #666; line-height: 1.6;">
              Great news! Your TurfEase owner account for <strong>${businessName}</strong> has been approved by our admin team.
            </p>
            <div style="background: #10b981; color: white; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0;">✅ Account Status: APPROVED</h3>
              <p style="margin: 0;">You can now access all owner features!</p>
            </div>
            <p style="color: #666; line-height: 1.6;">
              <strong>What's next?</strong>
            </p>
            <ul style="color: #666; line-height: 1.6;">
              <li>Log in to your TurfEase account</li>
              <li>Complete your turf listings</li>
              <li>Start accepting bookings</li>
              <li>Manage your business dashboard</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login"
                 style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Login to Your Account
              </a>
            </div>
            <p style="color: #666; line-height: 1.6;">
              If you have any questions, feel free to contact our support team.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Welcome to the TurfEase family!<br>
              The TurfEase Team
            </p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 TurfEase. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Owner approval email sent successfully:', result.messageId);

    return {
      success: true,
      messageId: result.messageId
    };
  } catch (error) {
    console.error('❌ Error sending owner approval email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send owner rejection email
const sendOwnerRejectionEmail = async (email, firstName, businessName, rejectionReason) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'TurfEase - Account Application Update',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">TurfEase</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #ef4444; margin-bottom: 20px;">Account Application Update</h2>
            <p style="color: #666; line-height: 1.6;">
              Hi ${firstName},
            </p>
            <p style="color: #666; line-height: 1.6;">
              Thank you for your interest in joining TurfEase as a turf owner. After careful review, we regret to inform you that your application for <strong>${businessName}</strong> has not been approved at this time.
            </p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0;">
              <h3 style="color: #ef4444; margin: 0 0 10px 0;">Application Status: Not Approved</h3>
              ${rejectionReason ? `
                <p style="margin: 0; color: #666;"><strong>Reason:</strong></p>
                <p style="margin: 5px 0 0 0; color: #666; font-style: italic;">${rejectionReason}</p>
              ` : ''}
            </div>
            <p style="color: #666; line-height: 1.6;">
              <strong>What can you do next?</strong>
            </p>
            <ul style="color: #666; line-height: 1.6;">
              <li>Review the feedback provided above</li>
              <li>Address any concerns mentioned</li>
              <li>Submit a new application when ready</li>
              <li>Contact our support team for clarification</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/register"
                 style="background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Submit New Application
              </a>
            </div>
            <p style="color: #666; line-height: 1.6;">
              We appreciate your interest in TurfEase and encourage you to reapply once you've addressed the feedback.
            </p>
            <p style="color: #666; line-height: 1.6;">
              Best regards,<br>
              The TurfEase Team
            </p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 TurfEase. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Owner rejection email sent successfully:', result.messageId);

    return {
      success: true,
      messageId: result.messageId
    };
  } catch (error) {
    console.error('❌ Error sending owner rejection email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  sendOTPEmail,
  sendResendOTPEmail,
  sendEmail,
  sendOwnerApprovalEmail,
  sendOwnerRejectionEmail
};