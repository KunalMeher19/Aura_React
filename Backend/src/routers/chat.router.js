const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware')
const chatController = require('../controllers/chat.controllers')

// POST /api/chat/
router.route('/')
    .post(authMiddleware.authUser, chatController.createChat)

// NOTE: Image uploads are handled via socket.io now. The old /upload endpoint was removed.

/* GET /api/chat/ */
router.get('/', authMiddleware.authUser, chatController.getChats)

/* GET /api/chat/messages/:id */
router.get('/messages/:id', authMiddleware.authUser, chatController.getMessages)

/* DELETE /api/chat/messages/:id */
router.delete('/messages/:id', authMiddleware.authUser, chatController.deleteChat)

module.exports = router;