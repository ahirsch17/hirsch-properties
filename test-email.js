require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('Testing email configuration...\n');

// Check environment variables or command line arguments
const emailUser = process.argv[2] || process.env.EMAIL_USER;
const emailPassword = process.argv[3] || process.env.EMAIL_PASSWORD;

console.log('EMAIL_USER:', emailUser ? `${emailUser.substring(0, 5)}...` : 'NOT SET');
console.log('EMAIL_PASSWORD:', emailPassword ? `${emailPassword.substring(0, 3)}... (${emailPassword.length} chars)` : 'NOT SET');

if (!emailUser || !emailPassword) {
  console.error('\n❌ ERROR: EMAIL_USER or EMAIL_PASSWORD is not set!');
  console.error('Make sure these are set in your .env file or Render environment variables.');
  process.exit(1);
}

// Try to create transporter
console.log('\nAttempting to create Gmail transporter...');
try {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPassword
    }
  });

  console.log('✅ Transporter created successfully!');
  
  // Try to verify the connection
  console.log('\nVerifying Gmail credentials...');
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Verification failed:', error.message);
      console.error('\nPossible issues:');
      console.error('1. Gmail app password is incorrect');
      console.error('2. 2-factor authentication is not enabled on Gmail account');
      console.error('3. App password was not generated correctly');
      console.error('4. Gmail account access is restricted');
      process.exit(1);
    } else {
      console.log('✅ Gmail credentials verified successfully!');
      console.log('\nEmail configuration is correct and ready to use.');
      process.exit(0);
    }
  });
} catch (error) {
  console.error('❌ Failed to create transporter:', error.message);
  process.exit(1);
}

