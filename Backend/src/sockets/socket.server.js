const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')
const aiService = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const messageModel = require('../models/message.model')
const { createMemory, queryMemory } = require('../services/vector.service');

function initSocketServer(httpServer) {

    const io = new Server(httpServer, {
        cors: {
            origin: "http://localhost:5173",
            allowedHeaders: ["Content-Type", "Authorization"],
            credentials: true
        }
    });

    /* Middlewware to check the user is loggedin or not */
    io.use(async (socket, next) => {
        /* We are doing the cookie.parse(...) because we are actually sending a or many strings of cookies inside the HTTP header */
        /* cookie.parser(...) takes that raw cookie string and turns it into an object we can work with */
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

        if (!cookies.token) {
            next(new Error("Authentication error: No token provided"));
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

    io.on("connection", (socket) => {
        socket.on("ai-message", async (messagePayload) => {

            try {
                // If an image was provided over socket, handle image upload flow here (moved from REST upload controller)
                if (messagePayload.image) {
                    const chatId = messagePayload.chat;
                    const userPrompt = messagePayload.content || '';

                    // Keep original data URI (if present) for AI processing, but do not store it in DB.
                    const originalData = messagePayload.image;

                    // Determine an extension from data URI if possible for filename
                    let ext = 'jpg';
                    const mimeMatch = String(originalData).match(/^data:(image\/[^;]+);base64,/);
                    if (mimeMatch) {
                        const mime = mimeMatch[1];
                        const parts = mime.split('/');
                        if (parts[1]) ext = parts[1].replace('+', '');
                    }

                    const fileName = `user_upload_${Date.now()}.${ext}`;

                    // Upload to ImageKit using storage.service. This returns an object containing the hosted URL.
                    let uploadResp;
                    try {
                        uploadResp = await uploadFile(originalData, fileName);
                    } catch (err) {
                        console.error('Image upload failed:', err && (err.message || err));
                        throw new Error('Image upload failed');
                    }

                    const hostedUrl = uploadResp && (uploadResp.url || uploadResp.filePath || uploadResp.name) ? (uploadResp.url || uploadResp.filePath || uploadResp.name) : null;

                    // Save user message with uploaded image URL (do not store base64)
                    const userMessage = await messageModel.create({
                        user: socket.user._id,
                        chat: chatId,
                        content: userPrompt ? `User uploaded image with prompt: ${userPrompt}` : 'User uploaded image',
                        image: hostedUrl || undefined,
                        prompt: userPrompt,
                        role: 'user'
                    });

                    // Call AI service with the original data (data URI or base64) so model can process the image
                    const aiResponse = await aiService.contentGenerator(originalData, userPrompt);

                    // Save AI response
                    const aiMessage = await messageModel.create({
                        user: socket.user._id,
                        chat: chatId,
                        content: aiResponse,
                        role: 'model'
                    });

                    // Generate embeddings and create memory entries (best-effort)
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

                    // Emit ai-response including previewId and hosted image URL so client can finalize preview bubble
                    const respPayload = {
                        content: aiResponse,
                        chat: chatId
                    };
                    if (messagePayload.previewId) respPayload.previewId = messagePayload.previewId;
                    // Provide the client the hosted URL for the final image
                    if (hostedUrl) respPayload.imageData = hostedUrl;

                    socket.emit('ai-response', respPayload);

                } else {
                    // Text-only flow: Save message and generate embeddings in parallel
                    const userContent = messagePayload.content || '';
                    const [message, vectors] = await Promise.all([
                        messageModel.create({
                            user: socket.user._id,
                            chat: messagePayload.chat,
                            content: userContent,
                            role: 'user'
                        }),
                        aiService.embeddingGenerator(userContent)
                    ]);

                    // Query memory, create memory, and get chat history in parallel
                    const [memory, chatHistory] = await Promise.all([
                        queryMemory({
                            queryVector: vectors,
                            limit: 3,
                            metadata: { user: socket.user._id }
                        }),
                        messageModel.find({ chat: messagePayload.chat }).sort({ createdAt: -1 }).limit(20).lean().then(messages => messages.reverse()),
                        createMemory({ vectors, messageId: message._id, metadata: { chat: messagePayload.chat, user: socket.user._id, text: userContent } })
                    ]);

                    const stm = chatHistory.map(item => ({ role: item.role, parts: [{ text: item.content }] }));
                    const ltm = [{
                        role: 'user', parts: [{
                            text: `
                        The following are retrieved messages from previous chats. They are provided as context to help you respond consistently.
                        -Always prioritize the most recent messages over older ones.
                        -Use this history only to maintain continuity and relevance.
                        -If the retrieved context is irrelevant, ignore it and respond naturally to the latest user query.

                        ${memory.map(item => item.metadata.text).join('\n')}
                        ` }]
                    }];

                    // Switch model if mode is 'thinking'
                    let modelOverride = undefined;
                    if (messagePayload.mode === 'thinking') {
                        modelOverride = 'gemini-2.5-flash';
                    }

                    const response = await aiService.contentGenerator([...ltm, ...stm], modelOverride ? { model: modelOverride } : undefined);

                    // Emit response early. If client provided a previewId (from local preview), include it so client can finalize preview bubble
                    const respPayload = { content: response, chat: messagePayload.chat };
                    if (messagePayload.previewId) respPayload.previewId = messagePayload.previewId;
                    socket.emit('ai-response', respPayload);

                    // Save response and embeddings in parallel
                    const [resposneMessage, resoponseVectors] = await Promise.all([
                        messageModel.create({ user: socket.user._id, chat: messagePayload.chat, content: response, role: 'model' }),
                        aiService.embeddingGenerator(response)
                    ]);

                    // Store AI response memory
                    await createMemory({ vectors: resoponseVectors, messageId: resposneMessage._id, metadata: { chat: messagePayload.chat, user: socket.user._id, text: response } });
                }

            } catch (error) {
                console.error("Socket AI handler error:", error);
                socket.emit("ai-response", {
                    content: "Something went wrong, please try again.",
                    chat: messagePayload.chat
                });
            }
        })

        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;