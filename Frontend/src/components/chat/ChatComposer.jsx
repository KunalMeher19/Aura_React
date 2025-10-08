import React, { useCallback, useRef, useLayoutEffect, useState, useEffect } from 'react';
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
  // Keep latest input in a ref to avoid stale closures in document listeners
  const latestInputRef = useRef(input);
  useEffect(() => { latestInputRef.current = input; }, [input]);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

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
      // allow sending when text or an attached image exists
      if ((typeof input === 'string' && input.trim()) || previewSrc) {
        // when previewSrc exists, include selectedFile if present
        if (previewSrc && selectedFile) {
          onSend && onSend({ file: selectedFile, imageData: previewSrc, prompt: (typeof input === 'string' ? input : '') });
          setPreviewSrc(null);
          setSelectedFile(null);
        } else {
          onSend && onSend();
        }
      }
    }
  }, [onSend, input, previewSrc, selectedFile]);

  // Close attach menu when clicking outside
  useEffect(() => {
    const onDocClick = (ev) => {
      if (!attachMenuRef.current) return;
      if (!attachMenuRef.current.contains(ev.target)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Focus the textarea when user clicks anywhere on the composer surface
  const focusInput = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // place cursor at end
      const el = textareaRef.current;
      const val = el.value;
      // Move caret to end without changing scroll
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = val?.length ?? 0;
      });
    }
  }, []);

  // Helper: detect if target is an editable element
  const isEditableTarget = (t) => {
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    // contentEditable
    if (t.isContentEditable) return true;
    return false;
  };

  // Global typing-to-focus and paste-to-focus behavior
  useEffect(() => {
    const onKeyDown = (e) => {
      // ignore if user is typing in an input/textarea/contentEditable already
      if (isEditableTarget(e.target)) return;
      // ignore modifier combos (except Shift)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // ignore function/navigation keys
      const k = e.key;
      if (!k) return;

      // If printable character (length 1) or space, focus and insert
      const printable = k.length === 1;
      if (printable || k === ' ') {
        e.preventDefault();
        focusInput();
        const prev = typeof latestInputRef.current === 'string' ? latestInputRef.current : '';
        const next = prev + (k === ' ' ? ' ' : k);
        setInput(next);
        latestInputRef.current = next;
        // After state update, ensure caret is at the end so the next character types after the first
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            const len = typeof next === 'string' ? next.length : 0;
            try { el.setSelectionRange(len, len); }
            catch {
              // Some browsers may throw if selection APIs are unavailable; safe to ignore
            }
          }
        });
        return;
      }

      // If Enter pressed first, just focus (don't send)
      if (k === 'Enter') {
        focusInput();
      }
    };

    const onPaste = (e) => {
      if (isEditableTarget(e.target)) return;
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      e.preventDefault();
      focusInput();
      const prev = typeof latestInputRef.current === 'string' ? latestInputRef.current : '';
      const next = prev + text;
      setInput(next);
      latestInputRef.current = next;
      // Keep caret at the end after paste-driven input
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const len = typeof next === 'string' ? next.length : 0;
          try { el.setSelectionRange(len, len); }
          catch {
            // Ignore selection errors
          }
        }
      });
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, [focusInput, setInput]);

  // Shared handler for file inputs (camera or gallery)
  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      // Only generate a local preview and keep the File. Do not auto-upload.
      const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          // keep local preview and the File object only; do not notify parent yet
          setPreviewSrc(dataUrl);
          setSelectedFile(file);
        };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <form className="composer" onSubmit={e => { 
      e.preventDefault();
      // if there's an attached file, send it along with the prompt
      if (previewSrc && selectedFile) {
        onSend && onSend({ file: selectedFile, imageData: previewSrc, prompt: (typeof input === 'string' ? input : '') });
        setPreviewSrc(null);
        setSelectedFile(null);
        return;
      }
      if ((typeof input === 'string' && input.trim())) onSend && onSend();
    }}>
      <div
        className="composer-surface"
        data-state={isSending ? 'sending' : undefined}
        onMouseDown={() => {
          // Always focus the input when clicking anywhere on the surface
          // (lets buttons still work; focusing doesn't interfere)
          focusInput();
        }}
      >
        {/* Input row */}
        <div className="composer-field-row">
          <div className="composer-field">
            {/* Inline preview when an image is selected */}
            {previewSrc && (
              <div className="composer-image-preview" role="img" aria-label="Image preview">
                <img src={previewSrc} alt="preview" />
                <button type="button" aria-label="Remove image" onClick={() => { setPreviewSrc(null); setSelectedFile(null); }}>✕</button>
              </div>
            )}
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
            <div className='composer-input-row'>
              {/* Attach button */}
              <div className="attach-container" ref={attachMenuRef}>
                <button
                  type="button"
                  className="attach-btn icon-btn"
                  aria-label="Attach image"
                  aria-haspopup="true"
                  aria-expanded={attachMenuOpen}
                  onClick={() => setAttachMenuOpen(v => !v)}
                >
                  <span className="attach-icon" aria-hidden="true">+</span>
                </button>

                {/* Popup menu with two options: take photo or upload from gallery */}
                {attachMenuOpen && (
                  <div className="attach-menu" role="menu" aria-label="Attachment options">
                    <button type="button" role="menuitem" className="attach-menu-item" onClick={() => { setAttachMenuOpen(false); cameraInputRef.current && cameraInputRef.current.click(); }}>
                      Take photo
                    </button>
                    <button type="button" role="menuitem" className="attach-menu-item" onClick={() => { setAttachMenuOpen(false); galleryInputRef.current && galleryInputRef.current.click(); }}>
                      From gallery
                    </button>
                  </div>
                )}
              </div>

              {/* Hidden inputs: camera (with capture) and gallery (no capture) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  await handleFileChange(e);
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  await handleFileChange(e);
                }}
              />
              <div className="input-with-hint">
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
                  autoFocus
                />
                <div className="composer-hint" aria-hidden="true">Enter ↵ to send • Shift+Enter = newline</div>
              </div>
            </div>
          </div>
          <button
            type="submit"
            className="send-btn icon-btn"
            // allow sending when there is either text or an attached image
            disabled={!( (typeof input === 'string' && input.trim()) || previewSrc ) || isSending}
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
