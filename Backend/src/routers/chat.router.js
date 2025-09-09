const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware')
const chatController = require('../controllers/chat.controllers')
const multer = require('multer');

// Use memory storage so file buffer is available on req.file.buffer
const storage = multer.memoryStorage();
// Limit uploads to images and a max size (20MB default)
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const upload = multer({ 
    storage,
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Only image uploads are allowed'));
        } else {
            cb(null, true);
        }
    }
});

// POST /api/chat/
router.route('/')
    .post(authMiddleware.authUser, chatController.createChat)

/* POST /api/chat/upload - upload an image and generate AI response */
router.post('/upload', authMiddleware.authUser, (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err) {
            // Multer error (file too large / invalid type)
            return res.status(400).json({ message: err.message });
        }
        next();
    })
}, chatController.uploadImage)

/* GET /api/chat/ */
router.get('/', authMiddleware.authUser, chatController.getChats)

/* GET /api/chat/messages/:id */
router.get('/messages/:id', authMiddleware.authUser, chatController.getMessages)

/* DELETE /api/chat/messages/:id */
router.delete('/messages/:id', authMiddleware.authUser, chatController.deleteChat)

module.exports = router;