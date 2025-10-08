const PDFDocument = require('pdfkit');
const { format } = require('date-fns');
const https = require('https');
const http = require('http');

// Generate a booking/payment receipt PDF and return a Buffer
async function generateBookingReceiptPDF(booking, payment) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: 'TurfEase Booking Receipt',
          Author: 'TurfEase',
          Subject: `Booking Receipt - ${booking._id}`,
          Keywords: 'booking, receipt, turfease'
        }
      });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Color palette
      const primary = '#10b981';
      const success = '#059669';
      const warning = '#f59e0b';
      const danger = '#dc2626';
      const dark = '#111827';
      const muted = '#6b7280';
      const light = '#f9fafb';
      const border = '#e5e7eb';

      // Helper functions
      const hr = (y, width = 500, color = border) => {
        doc.save().strokeColor(color).lineWidth(1).moveTo(50, y).lineTo(50 + width, y).stroke().restore();
      };

      const drawTable = (x, y, width, rows, options = {}) => {
        const cellHeight = options.cellHeight || 25;
        const headerHeight = options.headerHeight || 30;
        const colWidths = options.colWidths || [width / 2, width / 2];
        
        let currentY = y;
        
        rows.forEach((row, index) => {
          const isHeader = index === 0;
          const rowHeight = isHeader ? headerHeight : cellHeight;
          
          // Row background
          if (isHeader) {
            doc.rect(x, currentY, width, rowHeight).fill(light).stroke();
          } else if (index % 2 === 0) {
            doc.rect(x, currentY, width, rowHeight).fillAndStroke('#fafafa', border);
          } else {
            doc.rect(x, currentY, width, rowHeight).stroke();
          }
          
          let currentX = x;
          row.forEach((cell, cellIndex) => {
            const cellWidth = colWidths[cellIndex];
            
            // Cell content
            doc.fillColor(isHeader ? dark : (cellIndex === 0 ? muted : dark))
               .fontSize(isHeader ? 11 : 10)
               .font(isHeader ? 'Helvetica-Bold' : (cellIndex === 0 ? 'Helvetica' : 'Helvetica-Bold'))
               .text(cell, currentX + 8, currentY + (rowHeight - 12) / 2, {
                 width: cellWidth - 16,
                 height: rowHeight,
                 ellipsis: true
               });
            
            currentX += cellWidth;
          });
          
          currentY += rowHeight;
        });
        
        return currentY;
      };

      const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
          case 'paid': case 'confirmed': case 'completed': return success;
          case 'pending': case 'processing': return warning;
          case 'failed': case 'cancelled': case 'rejected': return danger;
          default: return muted;
        }
      };

      const drawStatusBadge = (text, x, y, status) => {
        const color = getStatusColor(status);
        const badgeWidth = 80;
        const badgeHeight = 20;
        
        doc.roundedRect(x, y, badgeWidth, badgeHeight, 10)
           .fill(color)
           .fillColor('white')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(text.toUpperCase(), x, y + 6, { 
             width: badgeWidth, 
             align: 'center' 
           });
      };

      // Helper function to download image from URL
      const downloadImage = (url) => {
        return new Promise((resolve, reject) => {
          const protocol = url.startsWith('https:') ? https : http;
          protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`Failed to download image: ${response.statusCode}`));
              return;
            }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', reject);
        });
      };

      // Generate QR Code URL (using external service)
      const qrData = JSON.stringify({
        bookingId: booking._id.toString(),
        receiptId: `RCP-${booking._id.toString().slice(-8)}`,
        amount: booking.totalAmount || booking.paymentAmount,
        date: booking.bookingDate,
        verifyUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${booking._id}`
      });
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;
      
      // TurfEase logo URL (using a sports/turf related logo)
      const logoUrl = 'https://cdn-icons-png.flaticon.com/512/3048/3048425.png'; // Soccer/Football field icon

      // Page numbering function
       const addPageNumber = () => {
         try {
           const range = doc.bufferedPageRange();
           if (range && range.count > 0) {
             for (let i = 0; i < range.count; i++) {
               doc.switchToPage(i);
               doc.fontSize(8)
                  .fillColor(muted)
                  .text(`Page ${i + 1} of ${range.count}`, 50, 780, { 
                    width: 500, 
                    align: 'center' 
                  });
             }
           }
         } catch (e) {
           // Fallback: just add page number to current page
           doc.fontSize(8)
              .fillColor(muted)
              .text('Page 1', 50, 780, { 
                width: 500, 
                align: 'center' 
              });
         }
       };

      // Header section with enhanced branding
      doc.rect(0, 0, 612, 140).fill(primary);
      
      // Download and add logo
      try {
        const logoBuffer = await downloadImage(logoUrl);
        doc.image(logoBuffer, 50, 30, { width: 60, height: 60 });
      } catch (e) {
        // Fallback to text logo if download fails (ASCII only)
        doc.fillColor('white')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('TURFEASE', 50, 45);
      }
      
      // Brand text next to logo
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('TurfEase', 120, 35);
      
      doc.fontSize(14)
         .font('Helvetica')
         .text('Premium Sports Facility Booking', 120, 65);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('BOOKING RECEIPT', 120, 85);

      // Receipt metadata (top right)
      doc.fontSize(10)
         .text(`Receipt #: RCP-${booking._id.toString().slice(-8)}`, 400, 35)
         .text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 400, 50)
         .text(`Time: ${format(new Date(), 'HH:mm')}`, 400, 65);

      // QR Code for verification (top right corner)
      try {
        const qrBuffer = await downloadImage(qrCodeUrl);
        doc.image(qrBuffer, 460, 80, { width: 60, height: 60 });
        
        // QR Code label
        doc.fontSize(8)
           .fillColor('white')
           .text('Scan to Verify', 460, 145, { width: 60, align: 'center' });
      } catch (e) {
        // Fallback QR placeholder if download fails
        doc.rect(460, 80, 60, 60)
           .stroke()
           .fontSize(8)
           .fillColor('white')
           .text('QR CODE\nVerification', 465, 100, { width: 50, align: 'center' });
        console.log('QR code download failed, using placeholder');
      }

      // Reset position after header
      doc.y = 170;

      // Booking overview card with status
      doc.rect(50, doc.y, 500, 80)
         .fill(light)
         .strokeColor(primary)
         .lineWidth(2)
         .stroke();

      doc.fillColor(dark)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('Booking Confirmed', 70, doc.y + 15);

      // Status badge
      drawStatusBadge(booking.paymentStatus || 'confirmed', 400, doc.y + 15, booking.paymentStatus);

      doc.fontSize(11)
         .font('Helvetica')
         .fillColor(muted)
         .text('Thank you for choosing TurfEase. Your booking and payment have been processed successfully.', 
               70, doc.y + 45, { width: 320 });

      doc.y += 100;

      // Booking Details Table
      doc.fillColor(dark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Booking Information', 50, doc.y);
      
      doc.y += 30;

      const bookingDate = booking.bookingDate ? new Date(booking.bookingDate) : null;
      const formattedDate = bookingDate ? format(bookingDate, 'EEEE, dd MMM yyyy') : 'N/A';

      const bookingRows = [
        ['Field', 'Details'],
        ['Booking ID', booking._id.toString()],
        ['Turf Name', booking.turfId?.name || 'N/A'],
        ['Customer', `${booking.customerInfo?.name || 'N/A'}`],
        ['Email', booking.customerInfo?.email || 'N/A'],
        ['Phone', booking.customerInfo?.phone || 'N/A'],
        ['Booking Date', formattedDate],
        ['Time Slot', `${booking.startTime} - ${booking.endTime}`],
        ['Court Type', booking.courtType || 'Full Court'],
        ['Status', booking.status || 'Confirmed']
      ];

      doc.y = drawTable(50, doc.y, 500, bookingRows, {
        colWidths: [150, 350],
        cellHeight: 22,
        headerHeight: 28
      });

      doc.y += 30;

      // Payment Details Table
      doc.fillColor(dark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Payment Information', 50, doc.y);
      
      doc.y += 30;

      const paymentRows = [
        ['Field', 'Details'],
        ['Payment Method', booking.paymentMethod || 'Online'],
        ['Gateway', payment ? 'Razorpay' : 'N/A'],
        ['Order ID', payment?.orderId || 'N/A'],
        ['Payment ID', payment?.paymentId || 'N/A'],
        ['Transaction Date', booking.paidAt ? format(new Date(booking.paidAt), 'dd MMM yyyy, HH:mm') : 'N/A'],
        ['Amount Paid', `${payment?.amount ? Math.round(payment.amount / 100) : booking.paymentAmount || 0} INR`]
      ];

      doc.y = drawTable(50, doc.y, 500, paymentRows, {
        colWidths: [150, 350],
        cellHeight: 22,
        headerHeight: 28
      });

      doc.y += 30;

      // Pricing Summary Table
      doc.fillColor(dark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Pricing Breakdown', 50, doc.y);
      
      doc.y += 30;

      // Calculate duration from start and end time
      const startTime = booking.startTime;
      const endTime = booking.endTime;
      let duration = 1; // default
      
      if (startTime && endTime) {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        duration = (endMinutes - startMinutes) / 60;
      }
      
      const pricePerHour = booking.pricePerHour || 0;
      const courtMultiplier = booking.courtType === 'half' ? 0.5 : 1;
      const subtotal = Math.round(pricePerHour * duration * courtMultiplier);
      const total = booking.totalAmount || booking.paymentAmount || subtotal;
      
      // Calculate tax from the difference (if any)
      const tax = total > subtotal ? total - subtotal : 0;

      const pricingRows = [
        ['Description', 'Amount'],
        [`${booking.courtType || 'Full'} Court Booking (${duration}h @ ${pricePerHour}/hr)`, `${subtotal} INR`],
        ['Taxes & Fees', tax > 0 ? `${tax} INR` : '0 INR'],
        ['Discount', '0 INR'],
        ['Total Amount', `${total} INR`]
      ];

      doc.y = drawTable(50, doc.y, 500, pricingRows, {
        colWidths: [350, 150],
        cellHeight: 22,
        headerHeight: 28
      });

      doc.y += 50;

      // Terms & Conditions Section
      doc.fillColor(dark)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Terms and Conditions', 50, doc.y);
      
      hr(doc.y + 20);
      doc.y += 35;

      const terms = [
        '- Cancellation must be made at least 24 hours before the booking time for a full refund.',
        '- No refunds will be processed for cancellations made within 24 hours of booking.',
        '- Please arrive 15 minutes before your scheduled time slot.',
        '- TurfEase reserves the right to cancel bookings due to weather conditions.',
        '- Any damage to the facility will be charged separately.',
        '- This receipt serves as proof of payment and booking confirmation.'
      ];

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(muted);

      terms.forEach(term => {
        doc.text(term, 50, doc.y, { width: 500 });
        doc.y += 15;
      });

      // Enhanced Footer
      doc.y += 30;
      hr(doc.y, 500, primary);
      doc.y += 20;

      // Contact information
      doc.fontSize(10)
         .fillColor(dark)
         .font('Helvetica-Bold')
         .text('Contact Support', 50, doc.y);
      
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(muted)
         .text('Email: support@turfease.com  |  Phone: +91-9497082611  |  Web: www.turfease.com', 50, doc.y + 15);

      doc.fontSize(8)
         .text('Copyright 2024 TurfEase. All rights reserved. | Generated automatically on ' + 
               format(new Date(), 'dd MMM yyyy, HH:mm'), 50, doc.y + 35, { 
         align: 'center', 
         width: 500 
       });

      // Finalize document
       doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateBookingReceiptPDF,
};