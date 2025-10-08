import React from 'react';
import './ChatSidebar.css';
import binIcon from '../../assets/bin.svg';
import LogoutButton from './LogoutButton';

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
      <div className="sidebar-content">
        <nav className="chat-list" aria-live="polite">
          {chats.map(c => (
            <button
              key={c._id}
              className={"chat-list-item " + (c._id === activeChatId ? 'active' : '')}
              onClick={() => onSelectChat(c._id)}
            >
              <span className="title-line">
                <span>
                  {c.title}
                  {c.isTemp && (
                    <span className="temp-badge" title="Temporary chat">Temp</span>
                  )}
                </span>
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
        <div className="sidebar-footer">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
};

export default ChatSidebar;
