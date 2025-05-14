"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeOutTriggerModel = exports.LayerTriggerModel = exports.GeoRuleTriggerModel = exports.TriggerModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const triggerSchema = new mongoose_1.Schema({
    _id: { type: String, required: true, unique: true },
    type: {
        type: String,
        enum: ['geoRule', 'layer', 'timeOut'],
        required: true
    },
    actionIds: [String],
    actions: [{
            type: {
                type: String,
                enum: ['notification', 'addEntity', 'updateEntity'],
                required: true
            },
            payload: {
                type: mongoose_1.Schema.Types.Mixed,
                required: true
            }
        }],
    validity: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    entityId: String,
    vector: { type: [Number], default: [] },
    source: {
        type: String,
        enum: ['mongodb', 'qdrant', 'both'],
        default: 'both'
    },
    metadata: String,
    position: {
        lat: { type: Number },
        lng: { type: Number }
    },
    radius: { type: Number },
    layerId: { type: String },
    query: { type: mongoose_1.Schema.Types.Mixed },
    timeoutMs: { type: Number },
    sourceQuery: { type: mongoose_1.Schema.Types.Mixed },
    targetQuery: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
const geoRuleSchema = new mongoose_1.Schema({
    sourceQuery: { type: mongoose_1.Schema.Types.Mixed },
    targetQuery: { type: mongoose_1.Schema.Types.Mixed }
});
const layerSchema = new mongoose_1.Schema({
    layerId: { type: String },
    query: { type: mongoose_1.Schema.Types.Mixed }
});
const timeOutSchema = new mongoose_1.Schema({
    timeoutMs: { type: Number }
});
exports.TriggerModel = mongoose_1.default.model('Trigger', triggerSchema);
exports.GeoRuleTriggerModel = exports.TriggerModel.discriminator('geoRule', geoRuleSchema);
exports.LayerTriggerModel = exports.TriggerModel.discriminator('layer', layerSchema);
exports.TimeOutTriggerModel = exports.TriggerModel.discriminator('timeOut', timeOutSchema);
