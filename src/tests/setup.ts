import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to test database
beforeAll(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/beacon';
  const options = {
    user: process.env.MONGODB_USER,
    pass: process.env.MONGODB_PASSWORD,
    authSource: process.env.MONGODB_AUTH_SOURCE || 'admin'
  };
  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri, options);
});

// Disconnect from database after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// Clear all collections before each test
beforeEach(async () => {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB connection not established');
  }
  const collections: any = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}); 