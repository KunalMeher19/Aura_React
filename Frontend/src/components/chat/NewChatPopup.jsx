import React, { useState } from 'react';
import './NewChatPopup.css';

const NewChatPopup = ({ isOpen, onClose, onCreateChat }) => {
  const [title, setTitle] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (title.trim()) {
      onCreateChat(title.trim());
      setTitle('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <h3>Create New Chat</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter chat title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="popup-buttons">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewChatPopup;
