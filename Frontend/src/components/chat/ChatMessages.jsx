import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import './ChatMessages.css';


const ChatMessages = ({ messages, isSending }) => {
  const lastMessageRef = useRef(null);
  const containerRef = useRef(null);

  const [copiedIndex, setCopiedIndex] = useState(null);
  const [modal, setModal] = useState({ open: false, src: null, caption: null });

  useEffect(() => {
    const el = lastMessageRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    // Try bounding rect calculation first
    try {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Account for container's current scrollTop and padding
      const style = window.getComputedStyle(container);
      const paddingTop = parseFloat(style.paddingTop || '0');
      let top = elRect.top - containerRect.top + container.scrollTop - paddingTop;
      if (!Number.isFinite(top)) throw new Error('invalid top');

      // Cap to valid scroll range
      top = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
      container.scrollTo({ top, behavior: 'smooth' });
      return;
  } catch {
      // fallback to walking offsetTop chain: more robust if transformed ancestors exist
      let top = 0;
      let node = el;
      while (node && node !== container && node.offsetTop != null) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      // subtract container's padding
      const style = window.getComputedStyle(container);
      const paddingTop = parseFloat(style.paddingTop || '0');
      top = Math.max(0, top - paddingTop);
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [messages.length, isSending]);
  return (
  <>
  <div className="messages" ref={containerRef} aria-live="polite">
      {messages.map((m, index) => (
        <div
          key={index}
          ref={index === messages.length - 1 ? lastMessageRef : undefined}
          className={`msg msg-${m.type}`}
        >
          <div className="msg-role" aria-hidden="true">{m.type === 'user' ? 'You' : 'AI'}</div>
          <div className="msg-bubble">
              {/* If message has image or imageData, render image first */}
              {m.image || m.imageData ? (
                <div className="msg-image" style={{ position: 'relative' }}>
                  <img src={m.image || m.imageData} alt="uploaded" onClick={() => setModal({ open: true, src: (m.image || m.imageData), caption: m.prompt || m.content })} />
                  {typeof m.uploadProgress === 'number' && m.uploadProgress > 0 && m.uploadProgress < 100 && (
                    <div className="msg-upload-overlay" aria-hidden>
                      <div className="msg-upload-bar" style={{ width: `${m.uploadProgress}%` }} />
                      <div className="msg-upload-text">{m.uploadProgress}%</div>
                    </div>
                  )}
                </div>
              ) : null}
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {m.content}
              </ReactMarkdown>
          </div>
          <div className="msg-actions" role="group" aria-label="Message actions">
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                type="button"
                aria-label="Copy message"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(m.content);
                    setCopiedIndex(index);
                    setTimeout(() => setCopiedIndex(null), 1400);
                  } catch {
                    // ignore clipboard errors for now
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              </button>
              {copiedIndex === index && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#111',
                    color: '#fff',
                    padding: '6px 8px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                  }}
                >
                  Copied
                </div>
              )}
            </div>
            {m.role === 'ai' && (
              <>
                <button type="button" aria-label="Like response">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 10v11" /><path d="M15 21H9a2 2 0 0 1-2-2v-9l5-7 1 1a2 2 0 0 1 .5 1.3V9h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2Z" /></svg>
                </button>
                <button type="button" aria-label="Dislike response">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 14V3" /><path d="M9 3h6a2 2 0 0 1 2 2v9l-5 7-1-1a2 2 0 0 1-.5-1.3V15H5a2 2 0 0 1-2-2l2-8a2 2 0 0 1 2-2Z" /></svg>
                </button>
                <button type="button" aria-label="Speak message" onClick={() => { try { const u = new SpeechSynthesisUtterance(m.content); speechSynthesis.speak(u); } catch { /* speech synthesis unsupported */ } }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 8v8" /><path d="M8 4v16" /><path d="M12 2v20" /><path d="M19 5c1.5 2 1.5 12 0 14" /><path d="M16 8c.8 1 1 7 0 8" /></svg>
                </button>
                <button type="button" aria-label="Regenerate" onClick={() => { /* placeholder for regenerate logic */ }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12A10 10 0 0 1 12 2c2.5 0 4.8 1 6.5 2.5L22 8" /><path d="M22 2v6h-6" /><path d="M22 12a10 10 0 0 1-10 10c-2.5 0-4.8-1-6.5-2.5L2 16" /><path d="M2 22v-6h6" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {isSending && (
        <div className="msg msg-ai pending" ref={lastMessageRef}>
          <div className="msg-role" aria-hidden="true">AI</div>
          <div className="msg-bubble typing-dots" aria-label="AI is typing">
            <span /><span /><span />
          </div>
        </div>
      )}
      {/* sentinel removed; scrolling now targets the newest message element */}
  </div>
  {modal.open && (
      <div className="image-modal" role="dialog" aria-modal="true" onClick={() => setModal({ open: false, src: null, caption: null })}>
        <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
          <img src={modal.src} alt="full" />
          {modal.caption && <div className="image-caption">{modal.caption}</div>}
          <button className="image-modal-close" onClick={() => setModal({ open: false, src: null, caption: null })} aria-label="Close">✕</button>
        </div>
      </div>
    )}
  </>
  );
};

export default ChatMessages;
