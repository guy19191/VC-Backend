"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGeoRuleTrigger = isGeoRuleTrigger;
exports.isLayerTrigger = isLayerTrigger;
exports.isTimeOutTrigger = isTimeOutTrigger;
// Type guard functions
function isGeoRuleTrigger(trigger) {
    return trigger.type === 'geoRule';
}
function isLayerTrigger(trigger) {
    return trigger.type === 'layer';
}
function isTimeOutTrigger(trigger) {
    return trigger.type === 'timeOut';
}
