import mongoose from 'mongoose';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

async function cleanup() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/beacon';
    console.log('Connecting to MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);

    // Drop MongoDB database
    console.log('Dropping MongoDB database...');
    await mongoose.connection.dropDatabase();
    console.log('MongoDB database dropped successfully');

    // Remove validation rules
    console.log('Removing validation rules...');
    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection not established');
    }
    await mongoose.connection.db.command({
      collMod: 'entities',
      validator: {},
      validationLevel: 'off'
    });
    await mongoose.connection.db.command({
      collMod: 'triggers',
      validator: {},
      validationLevel: 'off'
    });
    console.log('Validation rules removed successfully');

    // Connect to Qdrant
    const qdrantClient = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    
    // Get all collections
    const existingCollections = await qdrantClient.getCollections();
    
    // Delete each collection
    console.log('Deleting Qdrant collections...');
    for (const collection of existingCollections.collections) {
      console.log(`Deleting collection: ${collection.name}`);
      await qdrantClient.deleteCollection(collection.name);
    }
    console.log('Qdrant collections deleted successfully');

    // Recreate collections with proper settings
    console.log('Recreating Qdrant collections...');
    
    // Create entities collection
    try {
      await qdrantClient.createCollection('entities', {
        vectors: {
          size: 128,
          distance: 'Cosine'
        }
      });
      console.log('Entities collection created');
    } catch (error) {
      console.log('Entities collection might already exist');
    }

    // Create triggers collection
    try {
      await qdrantClient.createCollection('triggers', {
        vectors: {
          size: 128,
          distance: 'Cosine'
        }
      });
      console.log('Triggers collection created');
    } catch (error) {
      console.log('Triggers collection might already exist');
    }
    
    // Verify collections exist
    const availableCollections = await qdrantClient.getCollections();
    console.log('Available collections:', availableCollections.collections.map(c => c.name));

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup(); 