-- Create Bookings table for PostgreSQL/Neon
CREATE TABLE IF NOT EXISTS Bookings (
  id VARCHAR(255) PRIMARY KEY,
  property VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  "cancelId" VARCHAR(255) UNIQUE NOT NULL,
  "firstName" VARCHAR(255) NOT NULL,
  "lastName" VARCHAR(255) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_date_property ON Bookings(date, property);
CREATE INDEX IF NOT EXISTS idx_email ON Bookings(email);
CREATE INDEX IF NOT EXISTS idx_cancelId ON Bookings("cancelId");

