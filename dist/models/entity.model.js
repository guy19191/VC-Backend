"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const entitySchema = new mongoose_1.default.Schema({
    type: {
        type: String,
        required: true
    },
    properties: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {}
    },
    position: {
        lat: Number,
        lng: Number,
        entityTypes: [String]
    },
    vector: [Number],
    source: {
        type: String,
        enum: ['mongodb', 'qdrant', 'both'],
        default: 'both'
    },
    metadata: String,
    _id: { type: String, required: true, unique: true }
}, { timestamps: true });
exports.EntityModel = mongoose_1.default.model('Entity', entitySchema);
