import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import type { AIChatMessage } from '../../types/aiAssistant';

function MessageBubble({ message }: { message: AIChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`mb-2 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-daw-accent/80 text-white'
            : 'border border-[#3a3a3a] bg-[#2a2a2a] text-zinc-200'
        }`}
        data-message-role={message.role}
      >
        {message.content || '…'}
      </div>
    </div>
  );
}

export function AIAssistantPanel() {
  const show = useUIStore((state) => state.showAIAssistant);
  const messages = useUIStore((state) => state.aiChatMessages);
  const streaming = useUIStore((state) => state.aiAssistantStreaming);
  const suggestions = useUIStore((state) => state.aiAssistantSuggestions);
  const error = useUIStore((state) => state.aiAssistantError);
  const clearMessages = useUIStore((state) => state.clearAIChatMessages);
  const refreshSuggestions = useUIStore((state) => state.refreshAIAssistantSuggestions);
  const setShow = useUIStore((state) => state.setShowAIAssistant);
  const askAIAssistant = useUIStore((state) => state.askAIAssistant);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!show) return;
    refreshSuggestions();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [refreshSuggestions, show]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput('');
    await askAIAssistant(trimmed);
  }, [askAIAssistant, input, streaming]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  if (!show) return null;

  return (
    <div
      className="fixed top-11 right-0 bottom-6 z-50 flex w-[340px] flex-col border-l border-[#333] bg-[#1e1e1e] shadow-xl"
      data-testid="ai-assistant-panel"
      role="complementary"
      aria-label="AI Assistant"
    >
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-daw-accent">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M5 6.5h4M5 8.5h2.5" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="0.8" fill="currentColor" />
          </svg>
          <span className="text-[12px] font-medium text-zinc-200">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-[#333] hover:text-zinc-300"
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
            </svg>
          </button>
          <button
            onClick={() => setShow(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-[#333] hover:text-zinc-300"
            title="Close (Escape)"
            aria-label="Close AI Assistant"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="mt-8 space-y-3 text-center text-[11px] text-zinc-500">
            <div className="text-2xl">✨</div>
            <div className="font-medium text-zinc-400">AI Music Assistant</div>
            <div>Ask about production techniques, mixing, effects, or ACE-Step workflows in the current session.</div>
            <div className="mt-4 space-y-1.5">
              {suggestions.map((suggestion) => (
                <SuggestionChip key={suggestion} text={suggestion} onClick={setInput} />
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {error && (
          <div className="mb-2 rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-[#333] p-2">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about music production..."
            className="flex-1 resize-none rounded-lg border border-[#444] bg-[#2a2a2a] px-3 py-2 text-[12px] text-zinc-200 transition-colors placeholder:text-zinc-600 focus:border-daw-accent/50 focus:outline-none"
            rows={2}
            disabled={streaming}
            aria-label="Chat input"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || streaming}
            className="self-end rounded-lg bg-daw-accent/80 px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-daw-accent disabled:opacity-30 disabled:hover:bg-daw-accent/80"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
        <div className="mt-1 px-1 text-[10px] text-zinc-600">
          Shift+Enter for new line · Replies stream from live DAW context
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="block w-full rounded-md border border-[#3a3a3a] bg-[#2a2a2a] px-3 py-1.5 text-left text-[11px] text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-200"
    >
      {text}
    </button>
  );
}
