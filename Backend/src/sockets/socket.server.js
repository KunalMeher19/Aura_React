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

function initSocketServer(httpServer) {

    // Increase maxHttpBufferSize so clients can send larger binary/base64 payloads
    // Default in Socket.IO is ~1MB which causes uploads >1MB to fail. Set to 10MB here.
    const io = new Server(httpServer, {
        // allow larger incoming messages (bytes)
        maxHttpBufferSize: 15 * 1024 * 1024, // 15 MB
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
                    let originalData = messagePayload.image;

                    // Try to parse base64 data URI into a buffer so we can detect real mime type and convert if needed
                    let base64Data = null;
                    const dataUriMatch = String(originalData).match(/^data:([a-zA-Z0-9\-+/]+\/[a-zA-Z0-9\-+.]+)?;base64,(.*)$/);
                    if (dataUriMatch) {
                        base64Data = dataUriMatch[2];
                    } else {
                        // If no data URI header, try to assume the whole string is base64
                        // (some browser quirks may pass raw base64)
                        base64Data = String(originalData).replace(/^data:.*;base64,/, '');
                    }

                    const buffer = Buffer.from(base64Data, 'base64');

                    // Detect file type from buffer
                    let fileTypeResult = null;
                    try {
                        fileTypeResult = await FileType.fromBuffer(buffer);
                    } catch (e) {
                        console.warn('file-type detection failed', e && (e.message || e));
                    }

                    // Default extension
                    let ext = 'jpg';
                    let mime = 'image/jpeg';
                    if (fileTypeResult && fileTypeResult.ext && fileTypeResult.mime) {
                        ext = fileTypeResult.ext.replace('+', '');
                        mime = fileTypeResult.mime;
                    }

                    const fileName = `user_upload_${Date.now()}.${ext}`;

                    // If format is HEIC/HEIF or other non-web-friendly type, convert it to JPEG using sharp
                    let uploadBuffer = buffer;
                    let converted = false;
                    try {
                        if (fileTypeResult && /heic|heif/i.test(fileTypeResult.ext)) {
                            // Convert HEIC to JPEG
                            uploadBuffer = await sharp(buffer).jpeg({ quality: 82 }).toBuffer();
                            mime = 'image/jpeg';
                            ext = 'jpg';
                            converted = true;
                        }
                    } catch (e) {
                        console.warn('Image conversion failed, will attempt upload of original buffer', e && (e.message || e));
                        // fallback: keep uploadBuffer as original buffer
                        uploadBuffer = buffer;
                    }

                    // Prepare a data string for uploadFile: ImageKit accepts base64 data URIs or buffers; reuse existing behavior by creating a dataURI from uploadBuffer
                    const uploadData = `data:${mime};base64,${uploadBuffer.toString('base64')}`;

                    // Upload to ImageKit using storage.service. This returns an object containing the hosted URL.
                    let uploadResp;
                    try {
                        uploadResp = await uploadFile(uploadData, fileName);
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

                    // Call AI service with the original data (data URI or base64) so model can process the image.
                    // If we converted the image, send the converted data URI instead (more likely to be supported by AI model)
                    const aiInputData = converted ? uploadData : originalData;
                    const aiResponse = await aiService.contentGenerator(aiInputData, userPrompt);

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
                    const [message, vectors] = await Promise.all([
                        messageModel.create({
                            user: socket.user._id,
                            chat: messagePayload.chat,
                            content: messagePayload.content,
                            role: "user"
                        }),
                        aiService.embeddingGenerator(messagePayload.content)
                    ])

                    // Query memory, create memory, and get chat history in parallel
                    const [memory, chatHistory] = await Promise.all([
                        queryMemory({
                            queryVector: vectors,
                            limit: 3,
                            metadata: {
                                user: socket.user._id
                            }
                        }),
                        messageModel.find({ chat: messagePayload.chat }).sort({ createdAt: -1 }).limit(20).lean().then(messages => messages.reverse()),
                        createMemory({
                            vectors,
                            messageId: message._id,
                            metadata: {
                                chat: messagePayload.chat,
                                user: socket.user._id,
                                text: messagePayload.content
                            }
                        })
                    ]);

                    const stm = chatHistory.map(item => {
                        return {
                            role: item.role,
                            parts: [{ text: item.content }]
                        }
                    })

                    const ltm = [
                        {
                            role: "user",
                            parts: [{
                                text: `
                        The following are retrieved messages from previous chats. They are provided as context to help you respond consistently.
                        -Always prioritize the most recent messages over older ones.
                        -Use this history only to maintain continuity and relevance.
                        -If the retrieved context is irrelevant, ignore it and respond naturally to the latest user query.

                        ${memory.map(item => item.metadata.text).join("\n")}
                        `
                            }]
                        }
                    ]

                    // Switch model if mode is 'thinking'
                    let modelOverride = undefined;
                    if (messagePayload.mode === 'thinking') {
                        modelOverride = 'gemini-2.5-flash';
                    }
                    const response = await aiService.contentGenerator([...ltm, ...stm], modelOverride ? { model: modelOverride } : undefined)

                    // Emit response early
                    socket.emit("ai-response", {
                        content: response,
                        chat: messagePayload.chat
                    })

                    // Save response and embeddings in parallel
                    const [resposneMessage, resoponseVectors] = await Promise.all([
                        messageModel.create({
                            user: socket.user._id,
                            chat: messagePayload.chat,
                            content: response,
                            role: "model"
                        }),
                        aiService.embeddingGenerator(response)
                    ])

                    // Store AI response memory
                    await createMemory({
                        vectors: resoponseVectors,
                        messageId: resposneMessage._id,
                        metadata: {
                            chat: messagePayload.chat,
                            user: socket.user._id,
                            text: response
                        }
                    })
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