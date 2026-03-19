import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import {
  exportShareBundle,
  importShareBundle,
  generateShareLink,
  downloadShareBundle,
  copyShareLinkToClipboard,
} from '../../services/collaborationService';
import { toastSuccess, toastError, toastInfo } from '../../hooks/useToast';

export function ShareDialog() {
  const show = useCollaborationStore((s) => s.showShareDialog);
  const setShow = useCollaborationStore((s) => s.setShowShareDialog);
  const setActiveShare = useCollaborationStore((s) => s.setActiveShare);
  const activeShareUrl = useCollaborationStore((s) => s.activeShareUrl);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);

  const [tab, setTab] = useState<'share' | 'import'>('share');
  const [importText, setImportText] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!show) return null;

  const handleGenerateLink = () => {
    if (!project) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const link = generateShareLink(project, baseUrl, { readOnly });
    setActiveShare(link.token, link.url);
    toastSuccess('Share link generated');
  };

  const handleCopyLink = async () => {
    if (!activeShareUrl) return;
    const ok = await copyShareLinkToClipboard(activeShareUrl);
    if (ok) {
      setCopied(true);
      toastSuccess('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toastError('Failed to copy link');
    }
  };

  const handleDownloadBundle = () => {
    if (!project) return;
    downloadShareBundle(project);
    toastSuccess('Share bundle downloaded');
  };

  const handleCopyBundle = () => {
    if (!project) return;
    const json = exportShareBundle(project);
    navigator.clipboard.writeText(json).then(
      () => toastSuccess('Bundle JSON copied to clipboard'),
      () => toastError('Failed to copy'),
    );
  };

  const handleImportFromText = () => {
    try {
      const bundle = importShareBundle(importText);
      setProject(bundle.project);
      toastSuccess(`Imported "${bundle.project.name}" from share bundle`);
      setImportText('');
      setShow(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to import share bundle');
    }
  };

  const handleImportFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const bundle = importShareBundle(text);
        setProject(bundle.project);
        toastSuccess(`Imported "${bundle.project.name}" from file`);
        setShow(false);
      } catch {
        toastError('Invalid share bundle file');
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[440px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Share Project</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-daw-border">
          <button
            onClick={() => setTab('share')}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              tab === 'share'
                ? 'text-daw-accent border-b-2 border-daw-accent'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            Share
          </button>
          <button
            onClick={() => setTab('import')}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              tab === 'import'
                ? 'text-daw-accent border-b-2 border-daw-accent'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            Import
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {tab === 'share' && project && (
            <>
              {isViewerMode && (
                <div className="px-3 py-2 text-xs text-amber-400 bg-amber-950/30 rounded border border-amber-800/50">
                  You are in viewer mode. Sharing is limited.
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Share "{project.name}" — {project.tracks.length} track
                  {project.tracks.length !== 1 ? 's' : ''}
                </p>

                {/* Share link section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={readOnly}
                        onChange={(e) => setReadOnly(e.target.checked)}
                        className="rounded"
                      />
                      Read-only (viewer mode)
                    </label>
                  </div>

                  <button
                    onClick={handleGenerateLink}
                    className="w-full px-4 py-2 text-xs font-medium bg-daw-accent text-white rounded transition-colors hover:bg-daw-accent-hover"
                  >
                    Generate Share Link
                  </button>

                  {activeShareUrl && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={activeShareUrl}
                        className="flex-1 px-2 py-1.5 text-xs bg-daw-surface-2 border border-daw-border rounded text-zinc-300 truncate"
                      />
                      <button
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors whitespace-nowrap"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Download bundle section */}
                <div className="pt-2 border-t border-daw-border space-y-2">
                  <p className="text-xs text-zinc-500">
                    Or export as a shareable file (project data only, no audio):
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadBundle}
                      className="flex-1 px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
                    >
                      Download .json
                    </button>
                    <button
                      onClick={handleCopyBundle}
                      className="flex-1 px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
                    >
                      Copy JSON
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'import' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Import a shared project from a JSON bundle.
              </p>

              <button
                onClick={handleImportFromFile}
                className="w-full px-4 py-2 text-xs font-medium bg-daw-accent text-white rounded transition-colors hover:bg-daw-accent-hover"
              >
                Import from File
              </button>

              <div className="space-y-1">
                <p className="text-xs text-zinc-500">Or paste bundle JSON:</p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"format": "ace-step-share", ...}'
                  className="w-full h-24 px-2 py-1.5 text-xs bg-daw-surface-2 border border-daw-border rounded text-zinc-300 resize-none font-mono"
                />
                <button
                  onClick={handleImportFromText}
                  disabled={!importText.trim()}
                  className="w-full px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import from Text
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-daw-border">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
