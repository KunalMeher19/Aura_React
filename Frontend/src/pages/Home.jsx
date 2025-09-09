import React, { useEffect, useState } from 'react';
import { io } from "socket.io-client";
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';
import ChatMobileBar from '../components/chat/ChatMobileBar.jsx';
import ChatSidebar from '../components/chat/ChatSidebar.jsx';
import ChatMessages from '../components/chat/ChatMessages.jsx';
import ChatComposer from '../components/chat/ChatComposer.jsx';
import NewChatPopup from '../components/chat/NewChatPopup.jsx';
import '../components/chat/ChatLayout.css';
import {
  startNewChat,
  selectChat,
  setInput,
  sendingStarted,
  sendingFinished,
  setChats
} from '../store/chatSlice.js';

const Home = () => {
  const navigate = useNavigate();
  // Redux state
  const dispatch = useDispatch();
  const chats = useSelector(state => state.chat.chats);
  const activeChatId = useSelector(state => state.chat.activeChatId);
  const input = useSelector(state => state.chat.input);
  const isSending = useSelector(state => state.chat.isSending);

  useEffect(() => {
    const checkAuth = () => {
      const token = Cookies.get('token');
      if (!token) {
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate]);

  // Local state
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 960);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 960);
  const [socket, setSocket] = useState(null);
  const [isNewChatPopupOpen, setIsNewChatPopupOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [composerMode, setComposerMode] = useState('normal');

  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      const mobile = window.innerWidth < 960;
      setIsMobile(mobile);
      // On desktop, always show sidebar. On mobile, hide it initially
      setSidebarOpen(!mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNewChat = () => {
    setIsNewChatPopupOpen(true);
  }

  const createNewChat = async (title) => {
    try {
      const response = await axios.post("https://aura-x4bd.onrender.com/api/chat", {
        title
      }, {
        withCredentials: true
      });
      getMessages(response.data.chat._id);
      dispatch(startNewChat(response.data.chat));
      setSidebarOpen(false);
      toast.success('New chat created successfully!');
    } catch {
      toast.error('Failed to create new chat');
    }
  }

  const _activeChat = chats.find(c => c.id === activeChatId) || null;

  useEffect(() => {
    // Fetch chats
    axios.get("https://aura-x4bd.onrender.com/api/chat", { withCredentials: true })
      .then(response => {
        dispatch(setChats(response.data.chats.reverse()));
      })
      .catch(() => {
        toast.error('Failed to load chats');
      });

    // Setup socket
    const tempSocket = io("https://aura-x4bd.onrender.com", {
      withCredentials: true,
    });

    tempSocket.on("connect", () => {
      toast.success('Connected to chat server');
    });

    tempSocket.on("connect_error", () => {
      toast.error('Failed to connect to chat server');
    });

    tempSocket.on("ai-response", (messagePayload) => {
      // If server echoes a previewId and/or imageData, update the corresponding preview message
      if (messagePayload.previewId) {
        setMessages(prev => prev.map(m => m.id === messagePayload.previewId ? {
          ...m,
          image: messagePayload.imageData || m.imageData,
          imageData: undefined,
          uploadProgress: 0,
          preview: false
        } : m));
      }

      // Append AI response content
      setMessages((prevMessages) => [...prevMessages, {
        type: 'ai',
        content: messagePayload.content
      }]);

      // clear any sending state
      dispatch(sendingFinished());
    });

    tempSocket.on("error", (err) => {
      toast.error(err.message || 'An error occurred with the chat');
      dispatch(sendingFinished());
    });

    setSocket(tempSocket);

    // Cleanup
    return () => {
      tempSocket.disconnect();
    };
  }, [dispatch]);

  const sendMessage = async (maybeUpload) => {
    // Handle image preview payload from composer (immediate local preview)
    if (maybeUpload && maybeUpload.isUploadPreview) {
      // create a stable local id so we can update this message during upload
      const previewId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const previewMsg = { id: previewId, type: 'user', content: maybeUpload.prompt || 'Image', imageData: maybeUpload.imageData, prompt: maybeUpload.prompt, preview: true, uploadProgress: 0 };
      setMessages(prev => [...prev, previewMsg]);
      return;
    }

    // If composer provided a File to upload (final send), upload it now with the prompt
    if (maybeUpload && maybeUpload.file) {
      if (!activeChatId || isSending) return;

      // Find or create preview message
      let previewId = null;
      const found = messages.find(m => m.preview && (m.imageData === maybeUpload.imageData || m.prompt === maybeUpload.prompt));
      if (found && found.id) previewId = found.id;

      if (!previewId) {
        previewId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const previewMsg = { id: previewId, type: 'user', content: maybeUpload.prompt || 'Image', imageData: maybeUpload.imageData, prompt: maybeUpload.prompt, preview: true, uploadProgress: 0 };
        setMessages(prev => [...prev, previewMsg]);
      }

      dispatch(sendingStarted());
      dispatch(setInput(''));

      try {
        // Convert file to data URL (base64) and emit through socket
        const file = maybeUpload.file;
        const reader = new FileReader();

        // Simulate upload progress locally while reading/converting
        let progress = 0;
        const progInterval = setInterval(() => {
          progress = Math.min(95, progress + Math.floor(Math.random() * 10) + 5);
          setMessages(prev => prev.map(m => m.id === previewId ? { ...m, uploadProgress: progress } : m));
        }, 200);

        const dataUrl = await new Promise((resolve, reject) => {
          reader.onerror = () => {
            clearInterval(progInterval);
            reject(new Error('Failed to read file'));
          };
          reader.onload = () => {
            clearInterval(progInterval);
            resolve(reader.result);
          };
          reader.readAsDataURL(file);
        });

        // Finalize progress to 100% locally
        setMessages(prev => prev.map(m => m.id === previewId ? { ...m, uploadProgress: 100 } : m));

        // Send over socket as image payload. Include previewId so server can correlate.
        if (!socket?.connected) throw new Error('Not connected to socket');

        // For image uploads we emit a dedicated event to avoid mixing image payloads with text-only listeners
        socket.emit('ai-image-message', {
          chat: activeChatId,
          content: maybeUpload.prompt || '',
          mode: composerMode,
          image: dataUrl,
          previewId
        });

        // Let server respond via ai-response handler which will clear preview
      } catch {
        toast.error('Failed to send image');
        setMessages(prev => prev.map(m => m.id === previewId ? { ...m, uploadProgress: 0, preview: false, uploadError: true } : m));
        dispatch(sendingFinished());
      }

      return;
    }

    const trimmed = input.trim();
    if (!trimmed || !activeChatId || isSending) return;

    if (!socket?.connected) {
      toast.error('Not connected to chat server');
      return;
    }

    dispatch(sendingStarted());

    const newMessages = [...messages, {
      type: 'user',
      content: trimmed,
      mode: composerMode
    }];

    try {
      setMessages(newMessages);
      dispatch(setInput(''));

      socket.emit("ai-message", {
        chat: activeChatId,
        content: trimmed,
        mode: composerMode
      });

      // Auto-close sidebar on mobile after sending message
      if (isMobile) {
        setSidebarOpen(false);
      }
    } catch {
      toast.error('Failed to send message');
      dispatch(sendingFinished());
    }
  }

  const toggleSidebar = () => {
    if (isMobile) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const handleSelectChat = (chatId) => {
    dispatch(selectChat(chatId));
    // Auto-close sidebar on mobile when selecting a chat
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const getMessages = async (chatId) => {
    try {
      const response = await axios.get(`https://aura-x4bd.onrender.com/api/chat/messages/${chatId}`, { withCredentials: true });
      setMessages(response.data.messages.map(m => ({
        type: m.role === 'user' ? 'user' : 'ai',
        content: m.content,
        image: m.image || undefined,
        prompt: m.prompt || undefined
      })));
    } catch {
      toast.error('Failed to fetch messages');
    }
  }

  const deleteChat = async (chatId) => {
    try {
      await axios.delete(`https://aura-x4bd.onrender.com/api/chat/messages/${chatId}`, { withCredentials: true });
      dispatch(setChats(chats.filter(chat => chat._id !== chatId)));
      if (activeChatId === chatId) {
        dispatch(selectChat(null));
        setMessages([]);
      }
      toast.success('Chat deleted successfully');
    } catch {
      toast.error('Failed to delete chat');
    }
  }


  return (
    <div className={`chat-layout minimal ${isMobile ? 'mobile' : ''}`}>
      <ChatMobileBar
        onToggleSidebar={toggleSidebar}
        onNewChat={handleNewChat}
      />
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={(id) => {
          handleSelectChat(id);
          getMessages(id);
        }}
        onNewChat={handleNewChat}
        onToggleSidebar={toggleSidebar}
        open={sidebarOpen}
        isCollapsed={!isMobile && sidebarCollapsed}
        deleteChat={deleteChat}
      />
      <main className="chat-main" role="main">
        {messages.length === 0 && (
          <div className="chat-welcome" aria-hidden="true">
            <div className="chip">Early Preview</div>
            <h1>Aura</h1>
            <p>Ask anything. Paste text, brainstorm ideas, or get quick explanations. Your chats stay in the sidebar so you can pick up where you left off.</p>
            <p>Start by creating a new chat from top.</p>
          </div>
        )}
        <ChatMessages messages={messages} isSending={isSending} />
        {
          activeChatId &&
          <ChatComposer
            input={input}
            setInput={(v) => dispatch(setInput(v))}
            onSend={sendMessage}
            isSending={isSending}
            mode={composerMode}
            onModeChange={setComposerMode}
          />}
      </main>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <NewChatPopup
        isOpen={isNewChatPopupOpen}
        onClose={() => setIsNewChatPopupOpen(false)}
        onCreateChat={createNewChat}
      />
    </div>
  );
};

export default Home;
