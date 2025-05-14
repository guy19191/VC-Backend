import { Router } from 'express';
import { ActionController } from '../controllers/action.controller';

const router = Router();
const actionController = new ActionController();

// Create a new action
router.post('/add', actionController.addAction);

// Update an existing action
router.put('/update/:id', actionController.updateAction);

// Delete an action
router.delete('delete/:id', actionController.deleteAction);

// Get an action by ID
router.get('get/:id', actionController.getAction);

export default router; 