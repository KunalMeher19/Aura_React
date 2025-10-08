const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')
const aiService = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const FileType = require('file-type');
const sharp = require('sharp');
const messageModel = require('../models/message.model')
const { createMemory, queryMemory } = require('../services/vector.service');
const chatModel = require('../models/chat.model');

function initSocketServer(httpServer) {

    // Increase maxHttpBufferSize so clients can send larger binary/base64 payloads
    const io = new Server(httpServer, {
        maxHttpBufferSize: 15 * 1024 * 1024, // 15 MB
        cors: {
            origin: "http://localhost:5173",
            allowedHeaders: ["Content-Type", "Authorization"],
            credentials: true
        }
    });

    /*  Socket.io Middleware */
    io.use(async (socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

        if (!cookies.token) {
            return next(new Error("Authentication error: No token provided"));
        }

        try {
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error: Invalid token"))
        }
    })


    // Track number of connected users
    let connectedUsers = 0;

    io.on("connection", (socket) => {
        connectedUsers += 1;
        // Single concise log on user connect
        console.log(`user ${socket.id} connected (connected users: ${connectedUsers})`);

        // Image handling function extracted so we can expose a dedicated event and keep backward compatibility
        const processImagePayload = async (messagePayload) => {
            const chatId = messagePayload.chat;
            const userPrompt = messagePayload.content || '';

            let originalData = messagePayload.image;
            let base64Data = null;
            const dataUriMatch = String(originalData).match(/^data:([a-zA-Z0-9\-+\/]+\/[a-zA-Z0-9\-+.]+)?;base64,(.*)$/);
            if (dataUriMatch) {
                base64Data = dataUriMatch[2];
            } else {
                base64Data = String(originalData).replace(/^data:.*;base64,/, '');
            }

            const buffer = Buffer.from(base64Data, 'base64');

            let fileTypeResult = null;
            try {
                fileTypeResult = await FileType.fromBuffer(buffer);
            } catch (e) {
                console.warn('file-type detection failed', e && (e.message || e));
            }

            let ext = 'jpg';
            let mime = 'image/jpeg';
            if (fileTypeResult && fileTypeResult.ext && fileTypeResult.mime) {
                ext = fileTypeResult.ext.replace('+', '');
                mime = fileTypeResult.mime;
            }

            const fileName = `user_upload_${Date.now()}.${ext}`;

            let uploadBuffer = buffer;
            let converted = false;
            try {
                if (fileTypeResult && /heic|heif/i.test(fileTypeResult.ext)) {
                    uploadBuffer = await sharp(buffer).jpeg({ quality: 82 }).toBuffer();
                    mime = 'image/jpeg';
                    ext = 'jpg';
                    converted = true;
                }
            } catch (e) {
                console.warn('Image conversion failed, will attempt upload of original buffer', e && (e.message || e));
                uploadBuffer = buffer;
            }

            const uploadData = `data:${mime};base64,${uploadBuffer.toString('base64')}`;

            let uploadResp;
            try {
                uploadResp = await uploadFile(uploadData, fileName);
            } catch (err) {
                console.error('Image upload failed:', err && (err.message || err));
                throw new Error('Image upload failed');
            }

            const hostedUrl = uploadResp && (uploadResp.url || uploadResp.filePath || uploadResp.name) ? (uploadResp.url || uploadResp.filePath || uploadResp.name) : null;

            const userMessage = await messageModel.create({
                user: socket.user._id,
                chat: chatId,
                content: userPrompt ? userPrompt : 'Uploaded image',
                image: hostedUrl || undefined,
                prompt: userPrompt,
                role: 'user'
            });

            // Touch chat lastActivity and rename temp chat if this is the first message
            let updatedTitle;
            try {
                await chatModel.findByIdAndUpdate(chatId, { $set: { lastActivity: new Date() } });
                const [msgCount, chatDoc] = await Promise.all([
                    messageModel.countDocuments({ chat: chatId }),
                    chatModel.findById(chatId).lean()
                ]);
                if (chatDoc && chatDoc.isTemp && msgCount === 1) {
                    const newTitle = await aiService.generateTitleFromText(userPrompt || 'Image conversation');
                    await chatModel.findByIdAndUpdate(chatId, { $set: { title: newTitle, isTemp: false, lastActivity: new Date() } });
                    updatedTitle = newTitle;
                }
            } catch (e) {
                console.warn('Temp chat title update failed (image path):', e && (e.message || e));
            }

            const aiInputData = converted ? uploadData : originalData;
            // Respect composer mode for image flows as well. If the client sent
            // mode === 'thinking' prefer the higher-capability model.
            let modelOverride = undefined;
            if (messagePayload.mode === 'thinking') modelOverride = 'gemini-2.5-flash';

            const aiResponse = await aiService.contentGenerator(aiInputData, userPrompt, modelOverride ? { model: modelOverride } : undefined);

            const aiMessage = await messageModel.create({
                user: socket.user._id,
                chat: chatId,
                content: aiResponse,
                role: 'model'
            });
            try { await chatModel.findByIdAndUpdate(chatId, { $set: { lastActivity: new Date() } }); } catch {}

            try {
                const [uVec, aVec] = await Promise.all([
                    aiService.embeddingGenerator(userMessage.content),
                    aiService.embeddingGenerator(aiResponse)
                ]);

                await createMemory({ vectors: uVec, messageId: userMessage._id, metadata: { chat: chatId, user: socket.user._id, text: userMessage.content } });
                await createMemory({ vectors: aVec, messageId: aiMessage._id, metadata: { chat: chatId, user: socket.user._id, text: aiResponse } });
            } catch (e) {
                console.warn('Embedding generation failed for uploaded image flow', e && (e.message || e));
            }

            const respPayload = { content: aiResponse, chat: chatId, ...(updatedTitle ? { title: updatedTitle } : {}) };
            if (messagePayload.previewId) respPayload.previewId = messagePayload.previewId;
            if (hostedUrl) respPayload.imageData = hostedUrl;

            socket.emit('ai-response', respPayload);
        };

        // Listener for image+text payloads
        socket.on("ai-image-message", async (messagePayload) => {
            try {
                await processImagePayload(messagePayload);
            } catch (error) {
                console.error('ai-image-message handler error:', error);
                socket.emit("ai-response", {
                    content: "Something went wrong processing the image, please try again.",
                    chat: messagePayload && messagePayload.chat
                });
            }
        });

        // Text-only messages (backwards-compatible). If an image slips in, route to image handler.
        socket.on("ai-message", async (messagePayload) => {
            try {
                /* if (messagePayload && messagePayload.image) {
                    await processImagePayload(messagePayload);
                    return;
                } */

                const [message, vectors] = await Promise.all([
                    messageModel.create({
                        user: socket.user._id,
                        chat: messagePayload.chat,
                        content: messagePayload.content,
                        role: "user"
                    }),
                    aiService.embeddingGenerator(messagePayload.content)
                ]);

                // If this is the first message in a temp chat, generate a title and update the chat
                try {
                    const chatId = messagePayload.chat;
                    const [msgCount, chatDoc] = await Promise.all([
                        messageModel.countDocuments({ chat: chatId }),
                        chatModel.findById(chatId).lean()
                    ]);
                    // msgCount includes the just-created user message; first real message means count === 1
                    if (chatDoc && chatDoc.isTemp && msgCount === 1) {
                        const newTitle = await aiService.generateTitleFromText(messagePayload.content);
                        await chatModel.findByIdAndUpdate(chatId, { $set: { title: newTitle, isTemp: false, lastActivity: new Date() } });
                    }
                } catch (e) {
                    console.warn('Failed to generate/update temp chat title:', e && (e.message || e));
                }

                const [memory, chatHistory] = await Promise.all([
                    queryMemory({
                        queryVector: vectors,
                        limit: 3,
                        metadata: { user: socket.user._id }
                    }),
                    messageModel.find({ chat: messagePayload.chat }).sort({ createdAt: -1 }).limit(20).lean().then(messages => messages.reverse()),
                    createMemory({
                        vectors,
                        messageId: message._id,
                        metadata: { chat: messagePayload.chat, user: socket.user._id, text: messagePayload.content }
                    })
                ]);

                const stm = chatHistory.map(item => ({ role: item.role, parts: [{ text: item.content }] }));
                const ltm = [{ role: "user", parts: [{ text: `
                        The following are retrieved messages from previous chats. They are provided as context to help you respond consistently.
                        -Always prioritize the most recent messages over older ones.
                        -Use this history only to maintain continuity and relevance.
                        -If the retrieved context is irrelevant, ignore it and respond naturally to the latest user query.

                        ${memory.map(item => item.metadata.text).join("\n")}
                        ` }] }];

                let modelOverride = undefined;
                if (messagePayload.mode === 'thinking') modelOverride = 'gemini-2.5-flash';

                // Use the new message-style generator when we already have an array
                // of message objects (ltm + stm). Keep the original contentGenerator
                // available for image+text flows that send a base64 image + prompt.
                const response = await aiService.contentGeneratorFromMessages([...ltm, ...stm], modelOverride ? { model: modelOverride } : undefined);

                // Fetch latest chat doc to include updated title if it changed
                let updatedTitle;
                try {
                    const c = await chatModel.findById(messagePayload.chat).lean();
                    updatedTitle = c && c.title;
                } catch {}

                socket.emit("ai-response", { content: response, chat: messagePayload.chat, ...(updatedTitle ? { title: updatedTitle } : {}) });

                const [resposneMessage, resoponseVectors] = await Promise.all([
                    messageModel.create({ user: socket.user._id, chat: messagePayload.chat, content: response, role: "model" }),
                    aiService.embeddingGenerator(response)
                ]);

                await createMemory({ vectors: resoponseVectors, messageId: resposneMessage._id, metadata: { chat: messagePayload.chat, user: socket.user._id, text: response } });

            } catch (error) {
                console.error("Socket AI handler error:", error);
                socket.emit("ai-response", { content: "Something went wrong, please try again.", chat: messagePayload && messagePayload.chat });
            }
        });

        socket.on("disconnect", () => {
            connectedUsers = Math.max(0, connectedUsers - 1);
            console.log(`user ${socket.id} disconnected`);
            console.log(`connected users: ${connectedUsers}`);
        });
    });

    // Removed periodic logging of connected users to prevent noisy logs

}

module.exports = initSocketServer;