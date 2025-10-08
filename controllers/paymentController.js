const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Turf = require('../models/Turf');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_RL5vMta3bKvRd4',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '9qxxugjEleGtcqcOjWFmCB2n'
});

// Helper: send booking confirmation email with booking code + QR
const sendBookingConfirmationEmailForBooking = async (booking, recipientEmail, recipientName = 'Player') => {
    try {
        const { sendEmail } = require('../utils/universalEmailService');
        const { generateBookingReceiptPDF } = require('../utils/pdfReceipt');

        const code = booking.bookingCode || (booking._id?.toString() || '').slice(-8).toUpperCase();
        const qrData = JSON.stringify({ bookingId: booking._id?.toString(), bookingCode: code });
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrData)}`;

        const turfName = booking.turfId?.name || 'Turf';
        const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Helvetica Neue',Arial,sans-serif;max-width:680px;margin:0 auto;background:#f3f4f6;padding:24px;">
                <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.08);">
                    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;color:#fff;text-align:center;">
                        <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">TurfEase</div>
                        <div style="font-size:14px;opacity:.9;margin-top:4px;">Booking Confirmation</div>
                    </div>
                    <div style="padding:24px;">
                        <p style="margin:0 0 8px 0;color:#111827;font-weight:600;">Hi ${recipientName},</p>
                        <p style="margin:0 0 16px 0;color:#4b5563;">Your booking at <strong>${turfName}</strong> is confirmed. Please bring the QR or booking code for check‑in.</p>
                        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:12px;border:1px solid #e5e7eb;">
                            <thead>
                                <tr style="background:#f9fafb;">
                                    <th style="text-align:left;padding:10px 12px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Date</th>
                                    <th style="text-align:left;padding:10px 12px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Time</th>
                                    <th style="text-align:left;padding:10px 12px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Code</th>
                                    <th style="text-align:left;padding:10px 12px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">QR</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding:8px;border:1px solid #e5e7eb;">${new Date(booking.bookingDate).toDateString()}</td>
                                    <td style="padding:8px;border:1px solid #e5e7eb;">${booking.startTime} - ${booking.endTime}</td>
                                    <td style="padding:8px;border:1px solid #e5e7eb;"><code>${code}</code></td>
                                    <td style="padding:8px;border:1px solid #e5e7eb;"><img src="${qrUrl}" alt="QR" /></td>
                                </tr>
                            </tbody>
                        </table>
                        <div style="margin-top:16px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;color:#374151;font-size:13px;">Payment Method: <strong>${(booking.paymentMethod || 'online').toUpperCase()}</strong></div>
                        <div style="text-align:center;margin-top:20px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/bookings/my" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px;">View My Bookings</a>
                        </div>
                    </div>
                    <div style="padding:14px;text-align:center;background:#f9fafb;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} TurfEase. All rights reserved.</div>
                </div>
            </div>`;

        // Generate PDF receipt attachment
        const pdfBuffer = await generateBookingReceiptPDF(booking, {
          orderId: booking.razorpayOrderId,
          paymentId: booking.razorpayPaymentId,
          signature: booking.razorpaySignature,
          amount: booking.paymentAmount,
        });

        await sendEmail(
          recipientEmail,
          'Your TurfEase booking is confirmed',
          html,
          `Your booking at ${turfName} is confirmed. Code: ${code}.`,
          [
            { filename: `booking-${booking._id}-receipt.pdf`, content: pdfBuffer }
          ]
        );
    } catch (e) {
        console.log('Booking confirmation email (QR) failed:', e.message);
    }
};

// @desc    Create Razorpay payment order
// @route   POST /api/payment/create-order
// @access  Private
const createPaymentOrder = asyncHandler(async (req, res, next) => {
    const { bookingId, amount } = req.body;

    console.log('Payment order request:', { bookingId, amount, userId: req.user?.id });

    if (!bookingId || !amount) {
        return next(new ErrorResponse('Booking ID and amount are required', 400));
    }

    // Verify booking exists and belongs to user
    const booking = await Booking.findById(bookingId).populate('turfId', 'name');
    console.log('Found booking:', booking ? 'Yes' : 'No', booking?._id);

    if (!booking) {
        return next(new ErrorResponse('Booking not found', 404));
    }

    if (booking.customerId.toString() !== req.user.id) {
        return next(new ErrorResponse('Not authorized to pay for this booking', 403));
    }

    if (booking.paymentStatus === 'paid') {
        return next(new ErrorResponse('Booking is already paid', 400));
    }

    try {
        // Create Razorpay order
        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: `booking_${bookingId}`,
            notes: {
                bookingId: bookingId,
                turfName: booking.turfId?.name || 'Turf',
                customerName: booking.customerInfo?.name || 'Customer',
                bookingDate: booking.bookingDate.toISOString(),
                timeSlot: `${booking.startTime} - ${booking.endTime}`
            }
        };

        const order = await razorpay.orders.create(options);
        console.log('Razorpay order created:', order.id);

        // Update booking with order details
        booking.razorpayOrderId = order.id;
        booking.paymentAmount = amount;
        await booking.save();

        const responseData = {
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_RL5vMta3bKvRd4',
                bookingDetails: {
                    id: booking._id,
                    turfName: booking.turfId?.name,
                    date: booking.bookingDate,
                    timeSlot: `${booking.startTime} - ${booking.endTime}`,
                    customerName: booking.customerInfo?.name
                }
            }
        };

        console.log('Sending payment order response:', responseData);
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Razorpay order creation error:', error);
        return next(new ErrorResponse('Failed to create payment order', 500));
    }
});

// @desc    Verify Razorpay payment
// @route   POST /api/payment/verify
// @access  Private
const verifyPayment = asyncHandler(async (req, res, next) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        bookingId
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
        return next(new ErrorResponse('Missing payment verification data', 400));
    }

    try {
        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '9qxxugjEleGtcqcOjWFmCB2n')
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return next(new ErrorResponse('Invalid payment signature', 400));
        }

        // Find and update booking
        const booking = await Booking.findById(bookingId).populate('turfId', 'name');
        if (!booking) {
            return next(new ErrorResponse('Booking not found', 404));
        }

        if (booking.customerId.toString() !== req.user.id) {
            return next(new ErrorResponse('Not authorized', 403));
        }

        // Update booking payment status
        const wasPaid = booking.paymentStatus === 'paid';
        booking.paymentStatus = 'paid';
        booking.paymentMethod = 'online';
        booking.razorpayPaymentId = razorpay_payment_id;
        booking.razorpayOrderId = razorpay_order_id;
        booking.razorpaySignature = razorpay_signature;
        booking.paidAt = new Date();

        await booking.save();

        // Send only booking confirmation email with PDF receipt (combined email)
        try {
            if (!wasPaid && req.user?.email) {
                await sendBookingConfirmationEmailForBooking(booking, req.user.email, req.user.firstName || 'Player');
            }
        } catch (e) {
            console.log('Booking confirmation email after payment failed:', e.message);
        }

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                bookingId: booking._id,
                paymentId: razorpay_payment_id,
                amount: booking.paymentAmount,
                status: 'paid'
            }
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return next(new ErrorResponse('Payment verification failed', 500));
    }
});

// @desc    Get payment status
// @route   GET /api/payment/status/:orderId
// @access  Private
const getPaymentStatus = asyncHandler(async (req, res, next) => {
    const { orderId } = req.params;

    try {
        const order = await razorpay.orders.fetch(orderId);
        const booking = await Booking.findOne({ razorpayOrderId: orderId });

        if (!booking) {
            return next(new ErrorResponse('Booking not found for this order', 404));
        }

        if (booking.customerId.toString() !== req.user.id) {
            return next(new ErrorResponse('Not authorized', 403));
        }

        res.status(200).json({
            success: true,
            data: {
                orderId: order.id,
                status: order.status,
                amount: order.amount,
                bookingStatus: booking.paymentStatus,
                paymentId: booking.razorpayPaymentId
            }
        });
    } catch (error) {
        console.error('Payment status fetch error:', error);
        return next(new ErrorResponse('Failed to fetch payment status', 500));
    }
});

// @desc    Handle Razorpay webhooks
// @route   POST /api/payment/webhook
// @access  Public (but verified)
const handlePaymentWebhook = asyncHandler(async (req, res, next) => {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);

    try {
        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '9qxxugjEleGtcqcOjWFmCB2n')
            .update(webhookBody)
            .digest('hex');

        if (webhookSignature !== expectedSignature) {
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        const event = req.body;

        // Handle different webhook events
        switch (event.event) {
            case 'payment.captured':
                await handlePaymentCaptured(event.payload.payment.entity);
                break;
            case 'payment.failed':
                await handlePaymentFailed(event.payload.payment.entity);
                break;
            case 'order.paid':
                await handleOrderPaid(event.payload.order.entity);
                break;
            default:
                console.log(`Unhandled webhook event: ${event.event}`);
        }

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Helper function to handle payment captured
const handlePaymentCaptured = async (payment) => {
    try {
        const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
        if (booking && booking.paymentStatus !== 'paid') {
            booking.paymentStatus = 'paid';
            booking.razorpayPaymentId = payment.id;
            booking.paidAt = new Date();
                        await booking.save();
            console.log(`Payment captured for booking ${booking._id}`);

                        // Best-effort: send booking confirmation email with QR/code if we can infer recipient
                        try {
                            // We don't have req.user in webhook; try customerInfo.email
                            const recipientEmail = booking.customerInfo?.email;
                            if (recipientEmail) {
                                await sendBookingConfirmationEmailForBooking(booking, recipientEmail, booking.customerInfo?.name || 'Player');
                            }
                        } catch (e) {
                            console.log('Webhook: booking confirmation (QR) email failed:', e.message);
                        }
        }
    } catch (error) {
        console.error('Error handling payment captured:', error);
    }
};

// Helper function to handle payment failed
const handlePaymentFailed = async (payment) => {
    try {
        const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
        if (booking) {
            booking.paymentStatus = 'failed';
            await booking.save();
            console.log(`Payment failed for booking ${booking._id}`);
        }
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
};

// Helper function to handle order paid
const handleOrderPaid = async (order) => {
    try {
        const booking = await Booking.findOne({ razorpayOrderId: order.id });
        if (booking && booking.paymentStatus !== 'paid') {
            booking.paymentStatus = 'paid';
            booking.paidAt = new Date();
                        await booking.save();
            console.log(`Order paid for booking ${booking._id}`);

                        // Best-effort: send booking confirmation email with QR/code if we can infer recipient
                        try {
                            const recipientEmail = booking.customerInfo?.email;
                            if (recipientEmail) {
                                await sendBookingConfirmationEmailForBooking(booking, recipientEmail, booking.customerInfo?.name || 'Player');
                            }
                        } catch (e) {
                            console.log('Webhook (order.paid): booking confirmation (QR) email failed:', e.message);
                        }
        }
    } catch (error) {
        console.error('Error handling order paid:', error);
    }
};

module.exports = {
    createPaymentOrder,
    verifyPayment,
    getPaymentStatus,
    handlePaymentWebhook
};