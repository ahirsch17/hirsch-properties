
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Clean up old bookings (past dates)
async function cleanupOldBookings() {
  try {
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    
    // First, check how many past bookings exist
    const checkResult = await pool.query(
      'SELECT COUNT(*) as count FROM Bookings WHERE date < $1',
      [today]
    );
    const pastBookingsCount = parseInt(checkResult.rows[0].count);
    
    if (pastBookingsCount > 0) {
      console.log(`Found ${pastBookingsCount} past booking(s) to clean up.`);
      
      // Delete past bookings
      const result = await pool.query(
        'DELETE FROM Bookings WHERE date < $1',
        [today]
      );
      
      if (result.rowCount > 0) {
        console.log(`✅ Cleaned up ${result.rowCount} old booking(s) from the database (dates before ${today}).`);
      }
    } else {
      console.log(`No past bookings to clean up. All bookings are for ${today} or later.`);
    }
  } catch (err) {
    console.error('Error cleaning up old bookings:', err);
    console.error('Error details:', err.message, err.stack);
  }
}

// Initialize database table if it doesn't exist
async function initializeDatabase() {
  try {
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Bookings (
        id VARCHAR(255) PRIMARY KEY,
        property VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        time VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        "cancelId" VARCHAR(255) UNIQUE NOT NULL,
        "firstName" VARCHAR(255) NOT NULL,
        "lastName" VARCHAR(255) NOT NULL
      )
    `);
    
    // Create indexes if they don't exist
    await pool.query('CREATE INDEX IF NOT EXISTS idx_date_property ON Bookings(date, property)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_date_time ON Bookings(date, time)'); // For conflict checking
    await pool.query('CREATE INDEX IF NOT EXISTS idx_date ON Bookings(date)'); // For available times query
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email ON Bookings(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cancelId ON Bookings("cancelId")');
    
    console.log('Database table initialized successfully');
    
    // Clean up old bookings on startup
    await cleanupOldBookings();
    
    return true;
  } catch (err) {
    console.error('Error initializing database:', err);
    console.error('Database URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');
    return false;
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'website.html'));
});

app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Bookings');
    res.json(result.rows);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/booking', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing cancel ID.' });

  try {
    const result = await pool.query('SELECT * FROM Bookings WHERE "cancelId" = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/available-times', async (req, res) => {
  const { date, property } = req.query;
  if (!date || !property) return res.status(400).json({ error: 'Missing fields' });

  // Validate date is not today or in the past
  const selectedDate = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (selectedDate <= today) {
    return res.status(400).json({ error: 'Cannot book for today or past dates. Please select a future date.' });
  }

  // Validate date is not too far in the future (60 days maximum)
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 60); // 60 days from today
  
  if (selectedDate > maxDate) {
    return res.status(400).json({ error: 'Tours can only be booked up to 60 days in advance. Please select an earlier date.' });
  }

  // Validate date is a weekday (0 = Sunday, 6 = Saturday)
  const dayOfWeek = selectedDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(400).json({ error: 'Tours are only available on weekdays (Monday-Friday).' });
  }

  const allTimes = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
  try {
    // Check for ANY booking at this date/time (regardless of property) since only one employee
    const result = await pool.query(
      'SELECT time FROM Bookings WHERE date = $1',
      [date]
    );
    const bookedTimes = result.rows.map(row => row.time);
    const available = allTimes.filter(time => !bookedTimes.includes(time));
    console.log(`Available times for ${date}:`, available);
    console.log(`Booked times:`, bookedTimes);
    res.json({ times: available });
  } catch (err) {
    console.error('Available times error:', err);
    console.error('Error details:', err.message, err.stack);
    // Return all times as available if there's a database error (graceful degradation)
    res.json({ times: allTimes });
  }
});


app.post('/cancel/:id', async (req, res) => {
  const cancelId = req.params.id;

  try {
    const result = await pool.query('DELETE FROM Bookings WHERE "cancelId" = $1', [cancelId]);
    const cancelled = result.rowCount > 0;
    res.send(cancelled
      ? '<h2>Your booking has been cancelled.</h2>'
      : '<h2>Cancellation link is invalid or already used.</h2>'
    );
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).send('Server error.');
  }
});

app.post('/api/bookings', async (req, res) => {
  const { property, date, time, email, firstName, lastName } = req.body;

  // Validate date is not today or in the past
  const selectedDate = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (selectedDate <= today) {
    return res.status(400).json({ error: 'Cannot book for today or past dates. Please select a future date.' });
  }

  // Validate date is not too far in the future (60 days maximum)
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 60); // 60 days from today
  
  if (selectedDate > maxDate) {
    return res.status(400).json({ error: 'Tours can only be booked up to 60 days in advance. Please select an earlier date.' });
  }

  // Validate date is a weekday (0 = Sunday, 6 = Saturday)
  const dayOfWeek = selectedDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(400).json({ error: 'Tours are only available on weekdays (Monday-Friday).' });
  }

  // Validate time is one of the allowed times
  const validTimes = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
  if (!validTimes.includes(time)) {
    return res.status(400).json({ error: 'Invalid time slot selected.' });
  }

  const cancelId = uuidv4();
  const id = uuidv4();

  try {
    // Check if email already has a booking
    const existingResult = await pool.query(
      'SELECT * FROM Bookings WHERE email = $1',
      [email]
    );
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        error: "It looks like you've already booked a tour. Check your email for confirmation — you can cancel from there to reschedule."
      });
    }

    // Check if time slot is already taken (regardless of property - only one employee)
    const conflictResult = await pool.query(
      'SELECT COUNT(*) as count FROM Bookings WHERE date = $1 AND time = $2',
      [date, time]
    );
    if (conflictResult.rows[0] && parseInt(conflictResult.rows[0].count) > 0) {
      return res.status(409).json({ error: 'That time slot is already booked. Please select another time.' });
    }

    await pool.query(
      'INSERT INTO Bookings (id, property, date, time, email, "cancelId", "firstName", "lastName") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, property, date, time, email, cancelId, firstName, lastName]
    );

    // Send confirmation email (EXACT same as old working code)
    console.log('EMAIL: Creating transporter...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'hirschleasing@gmail.com',
        pass: process.env.EMAIL_PASSWORD
      }
    });

    const cancelLink = `https://hirsch-leasing.onrender.com/view-cancel.html?id=${cancelId}`;
    const mailOptions = {
      from: process.env.EMAIL_USER || 'hirschleasing@gmail.com',
      to: [email, 'hirschleasing@gmail.com'],
      subject: 'Your Tour Booking Confirmation',
      html: `
        <div style="text-align: center; margin-bottom: 1rem;">
          <img src="https://hirsch-leasing.onrender.com/Images/Logo.jpg" alt="Hirsch Leasing Logo" style="height: 60px;" />
        </div>
        <p>${firstName}, thank you for scheduling a tour with Hirsch Leasing!</p>
        <p><strong>Property:</strong> ${property}<br>
        <strong>Date:</strong> ${date}<br>
        <strong>Time:</strong> ${time}</p>
        <p>Please arrive at the property a few minutes before your scheduled tour. Most tours take about 30–45 minutes. Feel free to bring any questions — if we don't have the answers immediately, we'll follow up soon after.</p>
        <p>If you must cancel, please do so at least 24 hours in advance.</p>
        <a href="${cancelLink}" style="padding: 10px 15px; background: #5a1c1c; color: white; text-decoration: none; border-radius: 5px;">Manage My Booking</a>
      `
    };

    // Send email using await (same as old code)
    console.log('EMAIL: Attempting to send...');
    await transporter.sendMail(mailOptions);
    console.log('EMAIL: Sent successfully!');
    res.status(200).json({ message: 'Booking confirmed. Email sent.' });
  } catch (error) {
    console.error('EMAIL ERROR:', error.message);
    console.error('EMAIL ERROR CODE:', error.code);
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.delete('/cancel/:id', async (req, res) => {
  const cancelId = req.params.id;

  try {
    const result = await pool.query(
      'DELETE FROM Bookings WHERE "cancelId" = $1',
      [cancelId]
    );

    if (result.rowCount > 0) {
      res.status(200).send('Your booking has been cancelled.');
    } else {
      res.status(404).send('Booking not found or already cancelled.');
    }
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).send('Server error while cancelling booking.');
  }
});

app.post('/api/application', async (req, res) => {
  const { firstName, lastName, email, phone, property, moveIn, duration, occupants, message } = req.body;

  // Validate all required fields
  if (!firstName || !lastName || !email || !phone || !property || !moveIn || !duration || !occupants) {
    return res.status(400).json({ error: 'All required fields must be filled.' });
  }

  // Validate move-in date is at least 30 days from today
  const moveInDate = new Date(moveIn + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (moveInDate <= today) {
    return res.status(400).json({ error: 'Move-in date must be in the future. Please select a date at least 30 days from today.' });
  }

  const minMoveInDate = new Date(today);
  minMoveInDate.setDate(minMoveInDate.getDate() + 30); // 30 days from today
  
  if (moveInDate < minMoveInDate) {
    return res.status(400).json({ error: 'Move-in date must be at least 30 days from today. Please select a later date.' });
  }

  try {
    // Send confirmation email (EXACT same as old working code)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'hirschleasing@gmail.com',
        pass: process.env.EMAIL_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER || 'hirschleasing@gmail.com',
      to: [email, 'hirschleasing@gmail.com'],
      subject: `Lease Application Received - ${property}`,
      html: `
        <div style="text-align: center; margin-bottom: 1rem;">
          <img src="https://hirsch-leasing.onrender.com/Images/Logo.jpg" alt="Hirsch Leasing Logo" style="height: 60px;" />
        </div>
        <p><strong>Dear ${firstName} ${lastName},</strong></p>
        <p>Thank you for your interest in leasing with Hirsch Leasing!</p>
        <p>We have received your application for <strong>${property}</strong> and will review it shortly. Here's a summary of your application:</p>
        
        <div style="background: #f9f9f9; padding: 1rem; border-radius: 5px; margin: 1rem 0;">
          <p><strong>Application Details:</strong></p>
          <p><strong>Name:</strong> ${firstName} ${lastName}<br>
          <strong>Email:</strong> ${email}<br>
          <strong>Phone:</strong> ${phone}<br>
          <strong>Property:</strong> ${property}<br>
          <strong>Preferred Move-In Date:</strong> ${moveIn}<br>
          <strong>Lease Duration:</strong> ${duration}<br>
          <strong>Number of Occupants:</strong> ${occupants}</p>
          ${message ? `<p><strong>Additional Comments:</strong><br>${message}</p>` : ''}
        </div>

        <p>We will contact you within 1-2 business days to discuss next steps. If you have any urgent questions, please don't hesitate to reach out.</p>
        <p>Best regards,<br><strong>Hirsch Leasing Team</strong></p>
      `
    };

    // Send email using await (same as old code)
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Application submitted successfully. Email sent.' });
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ error: 'Server error while submitting application.' });
  }
});


// Start server after database initialization
async function startServer() {
  const dbInitialized = await initializeDatabase();
  if (!dbInitialized) {
    console.warn('Warning: Database initialization failed. Server will start but database operations may fail.');
    console.warn('Make sure DATABASE_URL environment variable is set correctly.');
  }
  
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  // Clean up old bookings daily at midnight
  setInterval(async () => {
    await cleanupOldBookings();
  }, 24 * 60 * 60 * 1000); // Run every 24 hours
}

startServer();
