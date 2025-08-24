import React from 'react';
import './ChatSidebar.css';
import binIcon from '../../assets/bin.svg';

const ChatSidebar = ({ chats, activeChatId, onSelectChat, onNewChat, onToggleSidebar, open, isCollapsed, deleteChat }) => {
  return (
    <aside className={"chat-sidebar " + (open ? 'open ' : '') + (isCollapsed ? 'collapsed' : '')} aria-label="Previous chats">
      <div className="sidebar-header">
        <div className="sidebar-top-row">
          <div className="sidebar-logo">
            <img src="/vite.svg" alt="ChatGPT Clone Logo" />
          </div>
          <div className="sidebar-buttons">
            <button className="collapse-button" onClick={onToggleSidebar}>
              <span className="icon">☰</span>
            </button>
            <button className="new-chat-button" onClick={onNewChat}>
              <span className="icon">＋</span>
            </button>
          </div>
        </div>
      </div>
      <nav className="chat-list" aria-live="polite">
        {chats.map(c => (
          <button
            key={c._id}
            className={"chat-list-item " + (c._id === activeChatId ? 'active' : '')}
            onClick={() => onSelectChat(c._id)}
          >
            <span className="title-line">
              {c.title}
              <div 
                className="delete-chat-button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c._id);
                }}
                role="button"
                tabIndex={0}
              >
                <img src={binIcon} alt="Delete chat" className="delete-icon" />
              </div>
            </span>
            
          </button>
        ))}
        {chats.length === 0 && <p className="empty-hint">No chats yet.</p>}
      </nav>
    </aside>
  );
};

export default ChatSidebar;
