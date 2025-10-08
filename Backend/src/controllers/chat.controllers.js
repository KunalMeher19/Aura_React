const chatModel = require('../models/chat.model');
const messageModel = require('../models/message.model');
const vectorService = require('../services/vector.service')
const aiService = require('../services/ai.service')
// ...existing code...

async function createChat(req, res) {
    const { title } = req.body;
    const user = req.user;

    // Just creating the title and storing into the DB
    const chat = await chatModel.create({
        title: title,
        user: user._id
    })

    res.status(201).json({
        message: "chat created successfully",
        chat: {
            _id: chat._id,
            title: chat.title,
            lastActivity: chat.lastActivity,
            user: chat.user
        }
    })
}

async function getChats(req, res) {
    const user = req.user;
    // Cleanup: remove any temp chats with zero messages (unused placeholders)
    const tempChats = await chatModel.find({ user: user._id, isTemp: true }).sort({ createdAt: -1 });
    if (tempChats.length > 1) {
        // Keep the most recent temp chat; delete older temp chats that are unused (0 messages)
        const keepId = String(tempChats[0]._id);
        const candidateIds = tempChats.slice(1).map(c => c._id);
        if (candidateIds.length) {
            const counts = await messageModel.aggregate([
                { $match: { chat: { $in: candidateIds } } },
                { $group: { _id: '$chat', count: { $sum: 1 } } }
            ]);
            const usedSet = new Set(counts.map(c => String(c._id)));
            const toDelete = candidateIds.filter(id => !usedSet.has(String(id)));
            if (toDelete.length) {
                await chatModel.deleteMany({ _id: { $in: toDelete } });
            }
        }
    }

    const chats = await chatModel.find({ user: user._id }).sort({ updatedAt: -1 });

    res.status(200).json({
        message: "chats fetched successfully",
        chats: chats.map(chat => ({
            _id: chat._id,
            title: chat.title,
            lastActivity: chat.lastActivity,
            user: chat.user,
            isTemp: !!chat.isTemp,
        }))
    })
}

async function getMessages(req, res) {
    const chatId = req.params.id;
    const messages = await messageModel.find({ chat: chatId }).sort({ createdAt: 1 });

    res.status(200).json({
        message: "messages fetched successfully",
        messages: messages
    })
}

async function deleteChat(req, res) {
    const chatId = req.params.id;

    await chatModel.findByIdAndDelete(chatId);
    await messageModel.deleteMany({ chat: chatId });
    await vectorService.deleteChatMemory(chatId);

    res.status(200).json({
        message: "chat deleted successfully"
    })
}


module.exports = {
    createChat,
    getChats,
    getMessages,
    deleteChat,
}