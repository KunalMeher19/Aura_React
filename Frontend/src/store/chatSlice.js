import { createSlice, nanoid } from '@reduxjs/toolkit';

// helpers
const createEmptyChat = (title) => ({ _id: nanoid(), title: title || 'New Chat', messages: [] });

const chatSlice = createSlice({
    name: 'chat',
    initialState: {
        chats: [],
        activeChatId: null,
        isSending: false,
        input: ''
    },
    reducers: {
        ensureInitialChat(state) {
            if (state.chats.length === 0) {
                const chat = createEmptyChat();
                state.chats.unshift(chat);
                state.activeChatId = chat._id;
            }
        },
        startNewChat: {
            reducer(state, action) {
                const { _id, title, isTemp } = action.payload;
                state.chats.unshift({ _id, title: title || 'New Chat', messages: [], ...(typeof isTemp === 'boolean' ? { isTemp } : {}) });
                state.activeChatId = _id;
            }
        },
        selectChat(state, action) {
            state.activeChatId = action.payload;
        },
        setInput(state, action) {
            state.input = action.payload;
        },
        sendingStarted(state) {
            state.isSending = true;
        },
        sendingFinished(state) {
            state.isSending = false;
        },
        setChats(state, action) {
            state.chats = action.payload;
        },
        addUserMessage: {
            reducer(state, action) {
                const { chatId, message } = action.payload;
                const chat = state.chats.find(c => c._id === chatId);
                if (!chat) return;
                if (chat.messages.length === 0) {
                    chat.title = message.content.slice(0, 40) + (message.content.length > 40 ? '…' : '');
                }
                chat.messages.push(message);
            },
            prepare(chatId, content) {
                return { payload: { chatId, message: { id: nanoid(), role: 'user', content, ts: Date.now() } } };
            }
        },
        addAIMessage: {
            reducer(state, action) {
                const { chatId, message } = action.payload;
                const chat = state.chats.find(c => c._id === chatId);
                if (!chat) return;
                chat.messages.push(message);
            },
            prepare(chatId, content, error = false) {
                return { payload: { chatId, message: { id: nanoid(), role: 'ai', content, ts: Date.now(), ...(error ? { error: true } : {}) } } };
            }
        },
        updateChatTitle(state, action) {
            const { chatId, title } = action.payload;
            const chat = state.chats.find(c => c._id === chatId);
            if (chat && title) {
                chat.title = title;
                if (chat.isTemp) chat.isTemp = false;
            }
        }
    }
});

export const {
    ensureInitialChat,
    startNewChat,
    selectChat,
    setInput,
    sendingStarted,
    sendingFinished,
    addUserMessage,
    addAIMessage,
    setChats,
    updateChatTitle
} = chatSlice.actions;

export default chatSlice.reducer;
