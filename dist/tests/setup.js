"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Connect to test database
beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/beacon';
    const options = {
        user: process.env.MONGODB_USER,
        pass: process.env.MONGODB_PASSWORD,
        authSource: process.env.MONGODB_AUTH_SOURCE || 'admin'
    };
    console.log('Connecting to MongoDB:', mongoUri);
    await mongoose_1.default.connect(mongoUri, options);
});
// Disconnect from database after all tests
afterAll(async () => {
    await mongoose_1.default.connection.dropDatabase();
    await mongoose_1.default.connection.close();
});
// Clear all collections before each test
beforeEach(async () => {
    if (!mongoose_1.default.connection.db) {
        throw new Error('MongoDB connection not established');
    }
    const collections = await mongoose_1.default.connection.db.collections();
    for (const collection of collections) {
        await collection.deleteMany({});
    }
});
