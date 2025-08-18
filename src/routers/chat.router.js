const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware')
const chatController = require('../controllers/chat.controllers')

// POST /api/chat/
router.route('/')
    .post(authMiddleware.authUser, chatController.createChat)

module.exports = router;