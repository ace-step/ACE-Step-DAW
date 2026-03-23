import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import type { AIChatMessage } from '../../types/aiAssistant';

const CHAT_PROVIDERS_KEY = 'ace-step-daw-chat-providers';
const CHAT_PROMPTS_KEY = 'ace-step-daw-chat-prompts';
const CHAT_SKILLS_KEY = 'ace-step-daw-chat-skills';

interface ChatProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

interface ChatPrompt {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

interface ChatSkill {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

const DEFAULT_PROVIDERS: ChatProvider[] = [
  { id: 'anthropic', name: 'Anthropic', apiKey: '', baseUrl: 'https://api.anthropic.com/v1', enabled: false },
  { id: 'openai', name: 'OpenAI', apiKey: '', baseUrl: 'https://api.openai.com/v1', enabled: false },
  { id: 'google', name: 'Google AI', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', enabled: false },
  { id: 'openrouter', name: 'OpenRouter', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', enabled: false },
  { id: 'deepseek', name: 'DeepSeek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', enabled: false },
  { id: 'xai', name: 'xAI', apiKey: '', baseUrl: 'https://api.xai.io/v1', enabled: false },
];

const DEFAULT_PROMPTS: ChatPrompt[] = [
  { id: 'system', name: 'System Prompt', content: 'You are an AI music production assistant for ACE-Step DAW. Help with mixing, production techniques, effects, and workflows.', enabled: true },
];

function loadFromStorage<T>(key: string, defaults: T[]): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T[];
  } catch { /* ignore */ }
  return defaults.map((d) => ({ ...d }));
}

function saveToStorage<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  anthropic: (
    <svg width="12" height="12" viewBox="50 50 412 412" fill="currentColor" aria-hidden="true">
      <path d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474z" />
    </svg>
  ),
  openai: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.28 9.37a5.93 5.93 0 00-.51-4.89 6.05 6.05 0 00-6.5-2.87A5.93 5.93 0 0010.8.16a6.05 6.05 0 00-5.77 4.17 5.93 5.93 0 00-3.97 2.88 6.05 6.05 0 00.74 7.1 5.93 5.93 0 00.51 4.89 6.05 6.05 0 006.5 2.87 5.93 5.93 0 004.47 1.45 6.05 6.05 0 005.77-4.17 5.93 5.93 0 003.97-2.88 6.05 6.05 0 00-.74-7.1zM13.27 22.18a4.48 4.48 0 01-2.88-1.05l.14-.08 4.78-2.76a.78.78 0 00.39-.67v-6.74l2.02 1.17a.07.07 0 01.04.05v5.58a4.52 4.52 0 01-4.49 4.5zM3.6 18.12a4.48 4.48 0 01-.54-3.02l.14.08 4.78 2.76a.78.78 0 00.78 0l5.83-3.37v2.33a.07.07 0 01-.03.06l-4.83 2.79a4.52 4.52 0 01-6.13-1.63zM2.34 7.9a4.48 4.48 0 012.34-1.97V11.6a.78.78 0 00.39.67l5.83 3.37-2.02 1.17a.07.07 0 01-.07 0L4 14.02A4.52 4.52 0 012.34 7.9zm17.23 4.02l-5.83-3.37 2.02-1.17a.07.07 0 01.07 0l4.83 2.79a4.52 4.52 0 01-.7 8.14v-5.72a.78.78 0 00-.39-.67zm2.01-3.03l-.14-.08-4.78-2.76a.78.78 0 00-.78 0L10.05 9.42V7.09a.07.07 0 01.03-.06l4.83-2.79a4.52 4.52 0 016.67 4.65zM8.89 12.62l-2.02-1.17a.07.07 0 01-.04-.05V5.82a4.52 4.52 0 017.37-3.49l-.14.08-4.78 2.76a.78.78 0 00-.39.67zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  ),
  google: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <text x="2" y="11" fill="currentColor" stroke="none" fontSize="12" fontWeight="700" fontFamily="Arial,sans-serif">G</text>
    </svg>
  ),
  openrouter: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M2 7h3l2-4 2 8 2-4h3" />
    </svg>
  ),
  deepseek: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5" />
      <path d="M7 4v3l2 2" />
    </svg>
  ),
  xai: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  ),
};

function loadProviders(): ChatProvider[] {
  const stored = loadFromStorage<ChatProvider>(CHAT_PROVIDERS_KEY, DEFAULT_PROVIDERS);
  return DEFAULT_PROVIDERS.map((dp) => {
    const existing = stored.find((p) => p.id === dp.id);
    return existing ? { ...dp, ...existing } : dp;
  });
}

type SettingsTab = 'providers' | 'prompts' | 'skills';

const inputClass = 'w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent/50 focus:outline-none';
const labelClass = 'block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1';


/* ── Providers tab ── */
function ProvidersTab() {
  const [providers, setProviders] = useState<ChatProvider[]>(loadProviders);
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? 'anthropic');
  const selected = providers.find((p) => p.id === selectedId) ?? providers[0];
  const [showKey, setShowKey] = useState(false);

  const updateProvider = (id: string, updates: Partial<ChatProvider>) => {
    setProviders((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveToStorage(CHAT_PROVIDERS_KEY, next);
      return next;
    });
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-[120px] shrink-0 border-r border-[#333] overflow-y-auto py-1">
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
            <span className="shrink-0 opacity-70">{PROVIDER_ICONS[p.id]}</span>
            <span className="truncate">{p.name}</span>
            {p.apiKey && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-auto" title="API key set" />}
          </button>
        ))}
      </div>
      {selected && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <div className="text-[13px] font-medium text-zinc-200">{selected.name}</div>
          <div>
            <label className={labelClass}>API Key</label>
            <div className="flex gap-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={selected.apiKey}
                onChange={(e) => updateProvider(selected.id, { apiKey: e.target.value })}
                placeholder={`Enter ${selected.name} API key`}
                className={`flex-1 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent/50 focus:outline-none`}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="flex h-7 w-7 items-center justify-center rounded border border-[#444] bg-[#2a2a2a] text-zinc-400 hover:bg-[#333] hover:text-zinc-300"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                  {showKey ? (
                    <><path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.5" /></>
                  ) : (
                    <><path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" /><path d="M2 12L12 2" /></>
                  )}
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>API Base URL</label>
            <input type="text" value={selected.baseUrl} onChange={(e) => updateProvider(selected.id, { baseUrl: e.target.value })} className={inputClass} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updateProvider(selected.id, { enabled: !selected.enabled })} className={`relative h-5 w-9 rounded-full transition-colors ${selected.enabled ? 'bg-daw-accent' : 'bg-[#444]'}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${selected.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-[11px] text-zinc-400">{selected.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Prompts tab ── */
function PromptsTab() {
  const [prompts, setPrompts] = useState<ChatPrompt[]>(() => loadFromStorage(CHAT_PROMPTS_KEY, DEFAULT_PROMPTS));
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? 'system');
  const selected = prompts.find((p) => p.id === selectedId);

  const updatePrompt = (id: string, updates: Partial<ChatPrompt>) => {
    setPrompts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveToStorage(CHAT_PROMPTS_KEY, next);
      return next;
    });
  };

  const addPrompt = () => {
    const id = `prompt-${Date.now()}`;
    setPrompts((prev) => {
      const next = [...prev, { id, name: 'New Prompt', content: '', enabled: true }];
      saveToStorage(CHAT_PROMPTS_KEY, next);
      return next;
    });
    setSelectedId(id);
  };

  const deletePrompt = (id: string) => {
    if (id === 'system') return; // Don't delete system prompt
    setPrompts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveToStorage(CHAT_PROMPTS_KEY, next);
      return next;
    });
    setSelectedId('system');
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-[120px] shrink-0 border-r border-[#333] overflow-y-auto py-1">
        {prompts.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors ${
              selectedId === p.id ? 'bg-daw-accent/20 text-daw-accent' : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
            }`}
          >
            {p.enabled && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        <button onClick={addPrompt} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300">
          + Add
        </button>
      </div>
      {selected && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={selected.name}
              onChange={(e) => updatePrompt(selected.id, { name: e.target.value })}
              className="bg-transparent text-[13px] font-medium text-zinc-200 focus:outline-none border-b border-transparent focus:border-daw-accent/50"
            />
            {selected.id !== 'system' && (
              <button onClick={() => deletePrompt(selected.id)} className="text-[10px] text-zinc-500 hover:text-red-400">Delete</button>
            )}
          </div>
          <div>
            <label className={labelClass}>Content</label>
            <textarea
              value={selected.content}
              onChange={(e) => updatePrompt(selected.id, { content: e.target.value })}
              placeholder="Enter prompt instructions..."
              className={`${inputClass} resize-none h-40`}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updatePrompt(selected.id, { enabled: !selected.enabled })} className={`relative h-5 w-9 rounded-full transition-colors ${selected.enabled ? 'bg-daw-accent' : 'bg-[#444]'}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${selected.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-[11px] text-zinc-400">{selected.enabled ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MCP tab ── */
function SkillsTab() {
  const [servers, setServers] = useState<ChatSkill[]>(() => loadFromStorage<ChatSkill>(CHAT_SKILLS_KEY, []));
  const [selectedId, setSelectedId] = useState(servers[0]?.id ?? '');
  const selected = servers.find((s) => s.id === selectedId);

  const updateServer = (id: string, updates: Partial<ChatSkill>) => {
    setServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      saveToStorage(CHAT_SKILLS_KEY, next);
      return next;
    });
  };

  const addServer = () => {
    const id = `skill-${Date.now()}`;
    const newServer: ChatSkill = { id, name: 'New Skill', url: '', enabled: true };
    setServers((prev) => {
      const next = [...prev, newServer];
      saveToStorage(CHAT_SKILLS_KEY, next);
      return next;
    });
    setSelectedId(id);
  };

  const deleteServer = (id: string) => {
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveToStorage(CHAT_SKILLS_KEY, next);
      return next;
    });
    setSelectedId(servers.find((s) => s.id !== id)?.id ?? '');
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-[120px] shrink-0 border-r border-[#333] overflow-y-auto py-1">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors ${
              selectedId === s.id ? 'bg-daw-accent/20 text-daw-accent' : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
            }`}
          >
            {s.enabled && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
            <span className="truncate">{s.name}</span>
          </button>
        ))}
        <button onClick={addServer} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300">
          + Add
        </button>
      </div>
      {selected ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={selected.name}
              onChange={(e) => updateServer(selected.id, { name: e.target.value })}
              className="bg-transparent text-[13px] font-medium text-zinc-200 focus:outline-none border-b border-transparent focus:border-daw-accent/50"
            />
            <button onClick={() => deleteServer(selected.id)} className="text-[10px] text-zinc-500 hover:text-red-400">Delete</button>
          </div>
          <div>
            <label className={labelClass}>Endpoint URL</label>
            <input
              type="text"
              value={selected.url}
              onChange={(e) => updateServer(selected.id, { url: e.target.value })}
              placeholder="https://example.com/skill"
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updateServer(selected.id, { enabled: !selected.enabled })} className={`relative h-5 w-9 rounded-full transition-colors ${selected.enabled ? 'bg-daw-accent' : 'bg-[#444]'}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${selected.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-[11px] text-zinc-400">{selected.enabled ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[11px] text-zinc-500">
          No skills configured. Click + Add to create one.
        </div>
      )}
    </div>
  );
}

/* ── Chat Settings (main container) ── */
function ChatSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('providers');

  const tabClass = (t: SettingsTab) =>
    `px-3 py-1.5 text-[11px] font-medium transition-colors ${
      tab === t
        ? 'text-daw-accent border-b-2 border-daw-accent'
        : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
    }`;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#333] px-3 py-2 shrink-0">
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-200"
          title="Back to Chat"
          aria-label="Back to Chat"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
        </button>
        <span className="text-[12px] font-medium text-zinc-200">Settings</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#333] shrink-0">
        <button className={tabClass('providers')} onClick={() => setTab('providers')}>Providers</button>
        <button className={tabClass('prompts')} onClick={() => setTab('prompts')}>Prompts</button>
        <button className={tabClass('skills')} onClick={() => setTab('skills')}>Skills</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'skills' && <SkillsTab />}
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
        <ChatSettings onClose={() => setShowSettings(false)} />
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
