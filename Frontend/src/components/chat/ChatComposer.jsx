import React, { useCallback, useRef, useLayoutEffect, useState } from 'react';
import './ChatComposer.css';

// NOTE: Public API (props) kept identical for drop-in upgrade
const ChatComposer = ({ input, setInput, onSend, isSending, mode = 'normal', onModeChange }) => {
  // Local state for mode if not controlled
  const [localMode, setLocalMode] = useState(mode);

  const handleToggle = () => {
    const newMode = (onModeChange ? (mode === 'normal' ? 'thinking' : 'normal') : (localMode === 'normal' ? 'thinking' : 'normal'));
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setLocalMode(newMode);
    }
  };
  const currentMode = onModeChange ? mode : localMode;
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Auto-grow textarea height up to max-height
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 320) + 'px';
  }, [input]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) onSend();
    }
  }, [onSend, input]);

  return (
    <form className="composer" onSubmit={e => { e.preventDefault(); if (input.trim()) onSend(); }}>
      <div className="composer-surface" data-state={isSending ? 'sending' : undefined}>
        {/* Input row */}
        <div className="composer-field-row">
            <div className="composer-field">
            {/* Inline preview when an image is selected */}
            {previewSrc && (
              <div className="composer-image-preview" role="img" aria-label="Image preview">
                <img src={previewSrc} alt="preview" />
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="upload-progress-overlay" aria-hidden>
                    <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                    <div className="upload-progress-text">{uploadProgress}%</div>
                  </div>
                )}
                <button type="button" aria-label="Remove image" onClick={() => { setPreviewSrc(null); setUploadProgress(0); }}>✕</button>
              </div>
            )}
            {/* Attach / Camera button */}
            <button
              type="button"
              className="attach-btn icon-btn"
              aria-label="Attach image"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              <span className="attach-icon" aria-hidden="true">+</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                  const form = new FormData();
                  // Attach file and include the current prompt text
                  form.append('file', file);
                  form.append('prompt', (typeof input === 'string' ? input : ''));
                  // If parent passed a chat id via onSend wrapper, it should handle; else include chat from dataset
                  const chatEl = document.querySelector('[data-active-chat]');
                  if (chatEl) form.append('chat', chatEl.getAttribute('data-active-chat'));

                  // Create a local preview (object URL) and immediately show it
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result;
                    setPreviewSrc(dataUrl);
                    // Inform parent to immediately append preview message
                    if (onSend) onSend({ isUploadPreview: true, imageData: dataUrl, prompt: (typeof input === 'string' ? input : '') });
                  };
                  reader.readAsDataURL(file);

                  // Use XHR to report upload progress
                  await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/chat/upload');
                    xhr.withCredentials = true;
                    xhr.upload.onprogress = (ev) => {
                      if (ev.lengthComputable) {
                        setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
                      }
                    };
                    xhr.onload = () => {
                      try {
                        const data = JSON.parse(xhr.responseText || '{}');
                        if (xhr.status >= 200 && xhr.status < 300) {
                          setUploadProgress(100);
                          setPreviewSrc(null);
                          setUploadProgress(0);
                          if (onSend) onSend({ isUpload: true, imageData: data.imageData, ai: data.ai, prompt: (typeof input === 'string' ? input : '') });
                          resolve();
                        } else {
                          console.error('Upload failed', data);
                          reject(new Error(data.message || 'Upload failed'));
                        }
                      } catch (e) {
                        reject(e);
                      }
                    };
                    xhr.onerror = () => reject(new Error('Network error'));
                    xhr.send(form);
                  });
                } finally {
                  // reset input so same file can be picked again
                  e.target.value = '';
                }
              }}
            />
            {/* Toggle row above input */}
            <div className="composer-mode-toggle composer-mode-toggle-top">
              <span className={"mode-label" + (currentMode === 'normal' ? ' active' : '')}>Normal</span>
              <button
                type="button"
                className={"mode-toggle-switch" + (currentMode === 'thinking' ? ' thinking' : '')}
                onClick={handleToggle}
                aria-label={currentMode === 'normal' ? 'Switch to Thinking mode' : 'Switch to Normal mode'}
              >
                <span className="toggle-thumb" />
              </button>
              <span className={"mode-label" + (currentMode === 'thinking' ? ' active' : '')}>Thinking</span>
            </div>
            <textarea
              ref={textareaRef}
              className="composer-input"
              placeholder="Message Aura…"
              aria-label="Message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              spellCheck
              autoComplete="off"
            />
            <div className="composer-hint" aria-hidden="true">Enter ↵ to send • Shift+Enter = newline</div>
          </div>
          <button
            type="submit"
            className="send-btn icon-btn"
            disabled={!input.trim() || isSending}
            aria-label={isSending ? 'Sending…' : 'Send message'}
          >
            <span className="send-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
export default ChatComposer;
