"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const actionSchema = new mongoose_1.default.Schema({
    type: {
        type: String,
        enum: ['notification', 'addEntity', 'updateEntity'],
        required: true
    },
    payload: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: true
    },
    query: {
        type: mongoose_1.default.Schema.Types.Mixed,
        required: false
    },
    id: {
        type: String,
        required: false
    },
    _id: { type: String, required: true, unique: true }
}, { timestamps: true });
exports.ActionModel = mongoose_1.default.model('Action', actionSchema);
