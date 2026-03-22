import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import type { AIChatMessage } from '../../types/aiAssistant';

const CHAT_PROVIDERS_KEY = 'ace-step-daw-chat-providers';

interface ChatProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

const DEFAULT_PROVIDERS: ChatProvider[] = [
  { id: 'anthropic', name: 'Anthropic', apiKey: '', baseUrl: 'https://api.anthropic.com/v1', enabled: false },
  { id: 'openai', name: 'OpenAI', apiKey: '', baseUrl: 'https://api.openai.com/v1', enabled: false },
  { id: 'google', name: 'Google AI', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', enabled: false },
  { id: 'openrouter', name: 'OpenRouter', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', enabled: false },
  { id: 'deepseek', name: 'DeepSeek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', enabled: false },
  { id: 'groq', name: 'Groq', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', enabled: false },
];

function loadProviders(): ChatProvider[] {
  try {
    const stored = localStorage.getItem(CHAT_PROVIDERS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ChatProvider[];
      // Merge with defaults to pick up newly added providers
      return DEFAULT_PROVIDERS.map((dp) => {
        const existing = parsed.find((p) => p.id === dp.id);
        return existing ? { ...dp, ...existing } : dp;
      });
    }
  } catch { /* ignore */ }
  return DEFAULT_PROVIDERS.map((p) => ({ ...p }));
}

function saveProviders(providers: ChatProvider[]) {
  localStorage.setItem(CHAT_PROVIDERS_KEY, JSON.stringify(providers));
}

function ChatProvidersSettings({ onClose }: { onClose: () => void }) {
  const [providers, setProviders] = useState<ChatProvider[]>(loadProviders);
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? 'anthropic');
  const selected = providers.find((p) => p.id === selectedId) ?? providers[0];

  const updateProvider = (id: string, updates: Partial<ChatProvider>) => {
    setProviders((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveProviders(next);
      return next;
    });
  };

  const [showKey, setShowKey] = useState(false);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2 shrink-0">
        <span className="text-[12px] font-medium text-zinc-200">Providers</span>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
          title="Back to Chat"
          aria-label="Back to Chat"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Provider list */}
        <div className="w-[110px] shrink-0 border-r border-[#333] overflow-y-auto py-1">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setShowKey(false); }}
              className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                selectedId === p.id
                  ? 'bg-daw-accent/20 text-daw-accent'
                  : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
              }`}
            >
              {p.apiKey && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="API key set" />
              )}
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>

        {/* Provider details */}
        {selected && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            <div className="text-[13px] font-medium text-zinc-200">{selected.name}</div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                API Key
              </label>
              <div className="flex gap-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={selected.apiKey}
                  onChange={(e) => updateProvider(selected.id, { apiKey: e.target.value })}
                  placeholder={`Enter ${selected.name} API key`}
                  className="flex-1 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent/50 focus:outline-none"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[#444] bg-[#2a2a2a] text-zinc-400 hover:bg-[#333] hover:text-zinc-300"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                    {showKey ? (
                      <>
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                        <circle cx="7" cy="7" r="1.5" />
                      </>
                    ) : (
                      <>
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                        <path d="M2 12L12 2" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={selected.baseUrl}
                onChange={(e) => updateProvider(selected.id, { baseUrl: e.target.value })}
                className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => updateProvider(selected.id, { enabled: !selected.enabled })}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  selected.enabled ? 'bg-daw-accent' : 'bg-[#444]'
                }`}
              >
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  selected.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-[11px] text-zinc-400">
                {selected.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [showSettings, setShowSettings] = useState(false);
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
      className="fixed top-11 right-0 bottom-6 flex w-[340px] flex-col border-l border-[#333] bg-[#1e1e1e] shadow-xl"
      style={{ zIndex: Z.panel }}
      data-testid="ai-assistant-panel"
      role="complementary"
      aria-label="AI Assistant"
    >
      {showSettings ? (
        <ChatProvidersSettings onClose={() => setShowSettings(false)} />
      ) : (
      <>
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="50 50 412 412" fill="currentColor" className="text-daw-accent" aria-hidden="true">
            <path d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474z" />
          </svg>
          <span className="text-[12px] font-medium text-zinc-200">Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
            title="Provider settings"
            aria-label="Provider settings"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="2" />
              <path d="M7 1.5v1.5M7 11v1.5M1.5 7H3M11 7h1.5M3.2 3.2l1 1M9.8 9.8l1 1M10.8 3.2l-1 1M4.2 9.8l-1 1" />
            </svg>
          </button>
          <button
            onClick={clearMessages}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
            </svg>
          </button>
          <button
            onClick={() => setShow(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
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
          <div className="mt-8 space-y-3 text-center text-[11px] text-zinc-400">
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
      </>
      )}
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
