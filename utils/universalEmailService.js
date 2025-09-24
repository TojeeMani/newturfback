const nodemailer = require('nodemailer');

// Universal email service - works on both localhost and Render
class UniversalEmailService {
  constructor() {
    this.transporter = null;
    this.init();
  }

  init() {
    try {
      // Check for Gmail credentials first
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
      
      if (emailUser && emailPass && 
          emailUser !== 'your-email@gmail.com' && 
          emailPass !== 'your-app-password' &&
          emailPass !== 'NOT SET') {
        
        console.log('✅ Universal Email Service: Using Gmail configuration');
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { 
            user: emailUser, 
            pass: emailPass 
          },
          tls: { rejectUnauthorized: false }
        });
        return;
      }

      // Check for generic SMTP
      if (process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)) {
        console.log('✅ Universal Email Service: Using SMTP configuration');
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
          },
          tls: { rejectUnauthorized: false }
        });
        return;
      }

      console.log('⚠️  Universal Email Service: No email credentials configured');
      this.transporter = null;
    } catch (error) {
      console.error('❌ Universal Email Service initialization failed:', error.message);
      this.transporter = null;
    }
  }

  // Test email configuration
  async testConnection() {
    if (!this.transporter) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service is working' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send basic email
  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.log('🔧 Development mode - Email would be sent to:', to);
      console.log('📋 Subject:', subject);
      console.log('📝 HTML:', html);
      return { 
        success: true, 
        messageId: 'dev-mode', 
        devMode: true,
        message: 'Email service not configured - using development mode'
      };
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@turfease.local',
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully. Message ID:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Email sending failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send OTP email
  async sendOTPEmail(email, otp, firstName = 'User') {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">TurfEase</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Email Verification</h2>
          <p style="color: #666; line-height: 1.6;">Hi ${firstName},</p>
          <p style="color: #666; line-height: 1.6;">Thank you for registering with TurfEase! To complete your registration, please use the following OTP:</p>
          <div style="background: #fff; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p style="color: #666; line-height: 1.6;">This OTP will expire in 10 minutes. If you didn't request this verification, please ignore this email.</p>
          <p style="color: #666; line-height: 1.6;">Best regards,<br>The TurfEase Team</p>
        </div>
        <div style="background: #333; padding: 20px; text-align: center;">
          <p style="color: #999; margin: 0; font-size: 12px;">© 2024 TurfEase. All rights reserved.</p>
        </div>
      </div>
    `;

    return await this.sendEmail(email, 'TurfEase - Email Verification OTP', html);
  }

  // Send booking confirmation email
  async sendBookingConfirmation(email, bookingDetails) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Booking Confirmed!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Your Booking is Confirmed</h2>
          <p style="color: #666; line-height: 1.6;">Hi ${bookingDetails.userName},</p>
          <p style="color: #666; line-height: 1.6;">Your booking has been confirmed! Here are the details:</p>
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p><strong>Turf:</strong> ${bookingDetails.turfName}</p>
            <p><strong>Date:</strong> ${bookingDetails.date}</p>
            <p><strong>Time:</strong> ${bookingDetails.timeSlot}</p>
            <p><strong>Duration:</strong> ${bookingDetails.duration} hours</p>
            <p><strong>Total Amount:</strong> ₹${bookingDetails.totalAmount}</p>
          </div>
          <p style="color: #666; line-height: 1.6;">Please arrive 15 minutes before your booking time. We look forward to seeing you!</p>
          <p style="color: #666; line-height: 1.6;">Best regards,<br>The TurfEase Team</p>
        </div>
      </div>
    `;

    return await this.sendEmail(email, 'TurfEase - Booking Confirmation', html);
  }
}

// Create singleton instance
const emailService = new UniversalEmailService();

// Export both the class and convenience functions
module.exports = {
  UniversalEmailService,
  emailService,
  
  // Convenience functions for backward compatibility
  sendEmail: (to, subject, html, text) => emailService.sendEmail(to, subject, html, text),
  sendOTPEmail: (email, otp, firstName) => emailService.sendOTPEmail(email, otp, firstName),
  sendBookingConfirmation: (email, bookingDetails) => emailService.sendBookingConfirmation(email, bookingDetails),
  testConnection: () => emailService.testConnection()
};