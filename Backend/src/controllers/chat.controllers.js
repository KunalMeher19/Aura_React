const chatModel = require('../models/chat.model');
const messageModel = require('../models/message.model');
const vectorService = require('../services/vector.service')
const aiService = require('../services/ai.service')
const path = require('path')
const fs = require('fs')

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

async function uploadImage(req, res) {
    try {
        const user = req.user;
        const chatId = req.body.chat;
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Read optional prompt text provided by frontend
        const userPrompt = req.body.prompt || req.body.text || '';

        // Convert buffer to base64 (or pass buffer directly to aiService if it supports it)
        const base64 = req.file.buffer.toString('base64');

        // Convert buffer to data URL for inline preview (size mindful)
        const mime = req.file.mimetype || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${base64}`;

        // Save a user message indicating an image was uploaded with the prompt and include image data for preview
        const userMessage = await messageModel.create({
            user: user._id,
            chat: chatId,
            content: `User uploaded image with prompt: ${userPrompt}`,
            image: dataUrl,
            prompt: userPrompt,
            role: 'user'
        })

        // Build payload for AI service. The aiService implementation may need to be extended to accept image data.
        // We'll send a text prompt that includes a base64 placeholder and the user's instruction.
        const promptPayload = [
            { role: 'user', parts: [{ text: `Here is an image (base64): ${base64}. Instructions: ${userPrompt}` }] }
        ];

        const aiResponse = await aiService.contentGenerator(promptPayload);
        
        // Save AI response
    const aiMessage = await messageModel.create({
            user: user._id,
            chat: chatId,
            content: aiResponse,
            role: 'model'
        })
        
        // Generate and store embeddings for both messages (best-effort)
    try {
            const [uVec, aVec] = await Promise.all([
                vectorService.embeddingGenerator(userMessage.content),
                vectorService.embeddingGenerator(aiResponse)
            ])
            await vectorService.createMemory({ vectors: uVec, messageId: userMessage._id, metadata: { chat: chatId, user: user._id, text: userMessage.content } })
            await vectorService.createMemory({ vectors: aVec, messageId: aiMessage._id, metadata: { chat: chatId, user: user._id, text: aiResponse } })
        } catch (e) {
            console.warn('Embedding generation failed for uploaded image flow', e.message || e)
        }
        
    res.status(200).json({ message: 'ok', ai: aiResponse, imageData: dataUrl });
        
    } catch (err) {
        console.error('uploadImage error', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    createChat,
    getChats,
    getMessages,
    deleteChat,
    uploadImage,
}