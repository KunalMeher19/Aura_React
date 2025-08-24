const chatModel = require('../models/chat.model');

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
    const chats = await chatModel.find({ user: user._id });

    res.status(200).json({
        message: "chats fetched successfully",
        chats: chats.map(chat => ({
            _id: chat._id,
            title: chat.title,
            lastActivity: chat.lastActivity,
            user: chat.user,
        }))
    })
}

module.exports = {
    createChat,
    getChats,
}