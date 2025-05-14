"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const action_controller_1 = require("../controllers/action.controller");
const router = (0, express_1.Router)();
const actionController = new action_controller_1.ActionController();
// Create a new action
router.post('/add', actionController.addAction);
// Update an existing action
router.put('/update/:id', actionController.updateAction);
// Delete an action
router.delete('delete/:id', actionController.deleteAction);
// Get an action by ID
router.get('get/:id', actionController.getAction);
exports.default = router;
