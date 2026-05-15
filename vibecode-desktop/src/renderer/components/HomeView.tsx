import React, { useState, useEffect, useCallback } from 'react';
import type { RecentProject, ProjectTemplate } from '../types';

interface HomeViewProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportRepo: () => void;
  onOpenRecent: (path: string) => void;
}

const TEMPLATES: ProjectTemplate[] = [
  { id: 'nextjs', name: 'Next.js App', description: 'Full-stack React framework', type: 'web-app', icon: '▲' },
  { id: 'express', name: 'Express API', description: 'Node.js REST API server', type: 'api-server', icon: '🚀' },
  { id: 'cli', name: 'CLI Tool', description: 'Command-line application', type: 'cli-tool', icon: '⚡' },
  { id: 'react', name: 'React SPA', description: 'Single page application', type: 'web-app', icon: '⚛' },
  { id: 'python', name: 'Python API', description: 'FastAPI / Flask backend', type: 'api-server', icon: '🐍' },
  { id: 'lib', name: 'Library', description: 'Reusable package / SDK', type: 'library', icon: '📦' },
];

const HomeView: React.FC<HomeViewProps> = ({
  onNewProject,
  onOpenProject,
  onImportRepo,
  onOpenRecent,
}) => {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [appVersion, setAppVersion] = useState('');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.vibecode?.workspace.recent(6);
        if (result?.success && result.data?.workspaces) {
          setRecentProjects(
            result.data.workspaces.map((ws) => ({
              name: ws.name,
              path: ws.path,
              type: 'web-app' as const,
              lastOpened: ws.lastOpened,
            })),
          );
        }
      } catch {
        // Not available
      }

      try {
        const version = await window.vibecode?.app.getVersion();
        if (version) setAppVersion(version);
      } catch {
        // Not available
      }
    };
    loadData();
  }, []);

  const formatTimeAgo = useCallback((timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, []);

  return (
    <div className="flex h-full bg-bg-deep">
      {/* Left: Branding & Navigation */}
      <div className="flex flex-col w-[360px] flex-shrink-0 border-r border-border bg-bg-base">
        {/* Logo Area */}
        <div className="px-8 pt-10 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 shadow-glow">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent">
                <path d="M10 2L2 6l8 4 8-4-8-4z" fill="currentColor" />
                <path d="M2 10l8 4 8-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 14l8 4 8-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary tracking-tight">VibeCode</h1>
              <p className="text-xs text-text-muted">AI-Native IDE</p>
            </div>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="px-6 space-y-3">
          <button
            onClick={onNewProject}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
              backgroundSize: '200% 200%',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="9" y1="3" x2="9" y2="15" />
              <line x1="3" y1="9" x2="15" y2="9" />
            </svg>
            Create New AI Project
          </button>

          <button
            onClick={onOpenProject}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-primary bg-bg-elevated border border-border transition-all duration-150 hover:bg-bg-hover hover:border-border-emphasis active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h4l1.5 1.5H14v7H2V4z" />
            </svg>
            Open Existing Project
          </button>

          <button
            onClick={onImportRepo}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-transparent border border-border transition-all duration-150 hover:bg-bg-elevated hover:text-text-primary active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 2v6l4 2" />
            </svg>
            Import Repository
          </button>
        </div>

        {/* Quick-Start Templates */}
        <div className="px-6 mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Quick Start
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                className="flex flex-col items-start p-3 rounded-md border border-border bg-bg-elevated/50 text-left transition-all duration-150 hover:bg-bg-hover hover:border-border-emphasis"
                onMouseEnter={() => setHoveredTemplate(template.id)}
                onMouseLeave={() => setHoveredTemplate(null)}
                onClick={onNewProject}
              >
                <span className="text-base mb-1">{template.icon}</span>
                <span className="text-xs font-medium text-text-primary">{template.name}</span>
                <span className="text-[10px] text-text-muted leading-tight mt-0.5">{template.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto px-6 py-4 border-t border-border">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>VibeCode {appVersion ? `v${appVersion}` : ''}</span>
            <button className="text-text-muted hover:text-text-secondary transition-colors">
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Right: Recent Projects & Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-12">
        {/* Hero Illustration */}
        <div className="mb-8 text-center animate-fade-in">
          <div className="flex h-20 w-20 mx-auto mb-4 items-center justify-center rounded-2xl" style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)' }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-accent">
              <path d="M20 4L4 12l16 8 16-8-16-8z" fill="currentColor" opacity="0.3" />
              <path d="M4 20l16 8 16-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 28l16 8 16-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-text-primary mb-2">
            Build with AI, ship with confidence
          </h2>
          <p className="text-sm text-text-muted max-w-md">
            VibeCode is your AI-native development environment. Create projects, write code with AI assistance, and deploy — all in one place.
          </p>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="w-full max-w-2xl animate-fade-in" style={{ animationDelay: '100ms' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Recent Projects
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  className="flex flex-col p-4 rounded-lg border border-border bg-bg-elevated/40 text-left transition-all duration-150 hover:bg-bg-hover hover:border-border-emphasis hover:shadow-md group"
                  onClick={() => onOpenRecent(project.path)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-accent opacity-60">
                      <path d="M1.5 2.5a1 1 0 011-1h3l1.5 1.5h4.5a1 1 0 011 1v7a1 1 0 01-1 1h-9a1 1 0 01-1-1v-8.5z" />
                    </svg>
                    <span className="text-sm font-medium text-text-primary truncate group-hover:text-accent-hover transition-colors">
                      {project.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted truncate">{project.path}</span>
                  <span className="text-[10px] text-text-muted mt-auto pt-2">
                    {formatTimeAgo(project.lastOpened)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {recentProjects.length === 0 && (
          <div className="text-center animate-fade-in" style={{ animationDelay: '200ms' }}>
            <p className="text-sm text-text-muted mb-4">
              No recent projects. Create one to get started.
            </p>
            <button
              onClick={onNewProject}
              className="btn btn-primary btn-lg rounded-lg"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
              New Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeView;
