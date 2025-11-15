
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

// Initialize database table if it doesn't exist
async function initializeDatabase() {
  try {
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email ON Bookings(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cancelId ON Bookings("cancelId")');
    
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Initialize database on server start
initializeDatabase();

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

  const allTimes = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
  try {
    const result = await pool.query(
      'SELECT time FROM Bookings WHERE date = $1 AND property = $2',
      [date, property]
    );
    const bookedTimes = result.rows.map(row => row.time);
    const available = allTimes.filter(time => !bookedTimes.includes(time));
    res.json({ times: available });
  } catch (err) {
    console.error('Available times error:', err);
    res.status(500).json({ error: 'Server error' });
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

    // Check if time slot is already taken
    const conflictResult = await pool.query(
      'SELECT COUNT(*) as count FROM Bookings WHERE date = $1 AND time = $2',
      [date, time]
    );
    if (conflictResult.rows[0] && parseInt(conflictResult.rows[0].count) > 0) {
      return res.status(409).json({ error: 'That slot is already taken.' });
    }

    await pool.query(
      'INSERT INTO Bookings (id, property, date, time, email, "cancelId", "firstName", "lastName") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, property, date, time, email, cancelId, firstName, lastName]
    );


    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'alexis.hirsch5@gmail.com',
        pass: 'idkx dgmu ndoz ffdz'
      }
    });

    const cancelLink = `https://hirsch-leasing.onrender.com/view-cancel.html?id=${cancelId}`;
    const mailOptions = {
      from: 'alexis.hirsch5@gmail.com',
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
        <p>Please arrive at the property a few minutes before your scheduled tour. Most tours take about 30–45 minutes. Feel free to bring any questions — if we don’t have the answers immediately, we’ll follow up soon after.</p>
        <p>If you must cancel, please do so at least 24 hours in advance.</p>
        <a href="${cancelLink}" style="padding: 10px 15px; background: #5a1c1c; color: white; text-decoration: none; border-radius: 5px;">Manage My Booking</a>
      `
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Booking confirmed. Email sent.' });
  } catch (error) {
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

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'alexis.hirsch5@gmail.com',
        pass: 'idkx dgmu ndoz ffdz'
      }
    });

    const mailOptions = {
      from: 'alexis.hirsch5@gmail.com',
      to: [email, 'alexis.hirsch5@gmail.com'],
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

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Application submitted successfully. Email sent.' });
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ error: 'Server error while submitting application.' });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
