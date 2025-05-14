"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const js_client_rest_1 = require("@qdrant/js-client-rest");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function cleanup() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/beacon';
        console.log('Connecting to MongoDB:', mongoUri);
        await mongoose_1.default.connect(mongoUri);
        // Drop MongoDB database
        console.log('Dropping MongoDB database...');
        await mongoose_1.default.connection.dropDatabase();
        console.log('MongoDB database dropped successfully');
        // Remove validation rules
        console.log('Removing validation rules...');
        if (!mongoose_1.default.connection.db) {
            throw new Error('MongoDB connection not established');
        }
        await mongoose_1.default.connection.db.command({
            collMod: 'entities',
            validator: {},
            validationLevel: 'off'
        });
        await mongoose_1.default.connection.db.command({
            collMod: 'triggers',
            validator: {},
            validationLevel: 'off'
        });
        console.log('Validation rules removed successfully');
        // Connect to Qdrant
        const qdrantClient = new js_client_rest_1.QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
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
        }
        catch (error) {
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
        }
        catch (error) {
            console.log('Triggers collection might already exist');
        }
        // Verify collections exist
        const availableCollections = await qdrantClient.getCollections();
        console.log('Available collections:', availableCollections.collections.map(c => c.name));
        // Close MongoDB connection
        await mongoose_1.default.connection.close();
        console.log('Cleanup completed successfully');
    }
    catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}
cleanup();
