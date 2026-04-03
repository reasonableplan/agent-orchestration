import { useEffect, useCallback, useState } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useOfficeStore } from '@/stores/office-store';
import SystemStatusBar from '@/components/SystemStatusBar';
import OfficeScene from '@/components/OfficeScene';
import ActivityLog from '@/components/ActivityLog';
import TokenUsagePanel from '@/components/TokenUsagePanel';
import StatsPanel from '@/components/StatsPanel';
import CommandBar from '@/components/CommandBar';
import AgentDetailPanel from '@/components/AgentDetailPanel';
import AgentSettingsModal from '@/components/AgentSettingsModal';
import BoardExpandedView from '@/components/BoardExpandedView';
import ToastContainer from '@/components/ToastContainer';
import ChatPanel from '@/components/ChatPanel';

type SidePanel = 'activity' | 'tokens' | 'stats';

export default function App() {
  const { sendCommand, sendChat } = useWebSocket();
  const updateAgent = useOfficeStore((s) => s.updateAgent);
  const addMessage = useOfficeStore((s) => s.addMessage);
  const updateTokenUsage = useOfficeStore((s) => s.updateTokenUsage);
  const selectedAgent = useOfficeStore((s) => s.selectedAgent);
  const [sidePanel, setSidePanel] = useState<SidePanel>('activity');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<string | null>(null);

  const handleOpenChat = useCallback((agentId: string) => {
    setChatTarget(agentId);
    setChatOpen(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const handleSendChat = useCallback(
    (content: string) => {
      sendChat(content);
      const { addChatMessage } = useOfficeStore.getState();
      addChatMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      });
    },
    [sendChat],
  );

  // Demo mode: simulate agent activity when there is no real server
  const startDemo = useCallback(() => {
    const agents = ['architect', 'designer', 'orchestrator', 'backend_coder', 'frontend_coder', 'reviewer', 'qa'] as const;

    // Weighted toward desk statuses; includes searching/delivering for variety
    const statuses = [
      'idle',
      'working', 'working', 'working',
      'thinking', 'thinking',
      'reviewing',
      'searching',
      'delivering',
    ] as const;

    const agentBubbles: Record<string, Array<{ content: string; type: 'task' | 'thinking' | 'info' }>> = {
      architect: [
        { content: 'Designing DB...', type: 'thinking' },
        { content: 'API schema done!', type: 'info' },
        { content: 'Updating ERD', type: 'task' },
        { content: 'Defining types...', type: 'thinking' },
      ],
      designer: [
        { content: 'UI mockup WIP', type: 'task' },
        { content: 'Component tree', type: 'thinking' },
        { content: 'Design guide done!', type: 'info' },
        { content: 'Responsive layout', type: 'thinking' },
      ],
      orchestrator: [
        { content: 'Assigning tasks...', type: 'thinking' },
        { content: 'Analyzing deps', type: 'task' },
        { content: 'Sprint planned!', type: 'info' },
        { content: 'Board updated', type: 'task' },
      ],
      backend_coder: [
        { content: 'Coding API...', type: 'task' },
        { content: 'Writing tests', type: 'task' },
        { content: 'DB model done!', type: 'info' },
        { content: 'Adding endpoint', type: 'task' },
      ],
      frontend_coder: [
        { content: 'Building component', type: 'task' },
        { content: 'API integration...', type: 'thinking' },
        { content: 'Page complete!', type: 'info' },
        { content: 'Zustand store', type: 'task' },
      ],
      reviewer: [
        { content: 'Reviewing PR...', type: 'thinking' },
        { content: 'Checking code', type: 'task' },
        { content: 'APPROVED!', type: 'info' },
        { content: 'REJECTED — fix needed', type: 'task' },
      ],
      qa: [
        { content: 'E2E testing...', type: 'task' },
        { content: 'Verifying API', type: 'thinking' },
        { content: 'Tests passed!', type: 'info' },
        { content: 'Bug found!', type: 'task' },
      ],
    };

    const interval = setInterval(() => {
      const agentId = agents[Math.floor(Math.random() * agents.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const showBubble = Math.random() > 0.35;
      const agentSpecificBubbles = agentBubbles[agentId] ?? agentBubbles.orchestrator;
      const bubble = showBubble ? agentSpecificBubbles[Math.floor(Math.random() * agentSpecificBubbles.length)] : null;

      updateAgent(agentId, {
        domain: agentId,
        status,
        bubble,
        currentTask: status === 'working' ? `task-${Math.floor(Math.random() * 100)}` : null,
      });

      // Simulate token usage
      if (status === 'working' || status === 'thinking' || status === 'reviewing') {
        const input = 500 + Math.floor(Math.random() * 2000);
        const output = 200 + Math.floor(Math.random() * 1500);
        updateTokenUsage(agentId, input, output);
      }

      if (showBubble && bubble) {
        addMessage({
          id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'agent.status',
          from: agentId,
          content: `${agentId} is ${status}: ${bubble.content}`,
          timestamp: new Date().toISOString(),
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [updateAgent, addMessage, updateTokenUsage]);

  // Demo mode: only runs when no real server connection within 3 seconds
  useEffect(() => {
    let demoCleanup: (() => void) | null = null;
    let cancelled = false;

    const timeout = setTimeout(() => {
      // Check if a real server sent an init event (double-check to avoid race)
      if (!cancelled && !useOfficeStore.getState().connected) {
        demoCleanup = startDemo();
      }
    }, 3000);

    // Watch for connection to cancel demo if server connects after demo started
    const unsub = useOfficeStore.subscribe((state) => {
      if (state.connected && demoCleanup) {
        cancelled = true;
        demoCleanup();
        demoCleanup = null;
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      demoCleanup?.();
      unsub();
    };
  }, [startDemo]);

  const handleCommand = useCallback(
    (command: string) => {
      sendCommand(command);
      addMessage({
        id: `cmd-${Date.now()}`,
        type: 'info',
        from: 'user',
        content: command,
        timestamp: new Date().toISOString(),
      });
    },
    [sendCommand, addMessage],
  );

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#2D1B0E]">
      {/* Top: Status bar */}
      <SystemStatusBar />

      {/* Center area: Office + Side Panel */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Main office scene */}
        <div className="flex-1 min-w-0">
          <OfficeScene />
        </div>

        {/* Right sidebar: agent detail OR tabs */}
        <div className="w-64 flex-shrink-0 hidden lg:flex flex-col">
          {selectedAgent ? (
            <AgentDetailPanel onOpenChat={handleOpenChat} />
          ) : (
            <>
              {/* Tab buttons */}
              <div className="flex border-b-2 border-[#5C3A1A] bg-[#3A2410]">
                <button
                  onClick={() => setSidePanel('activity')}
                  className={`flex-1 py-1.5 font-pixel text-[6px] transition-colors ${
                    sidePanel === 'activity'
                      ? 'text-amber-300 bg-[#2D1B0E] border-b-2 border-amber-400'
                      : 'text-amber-800 hover:text-amber-500'
                  }`}
                >
                  ACTIVITY
                </button>
                <button
                  onClick={() => setSidePanel('tokens')}
                  className={`flex-1 py-1.5 font-pixel text-[6px] transition-colors ${
                    sidePanel === 'tokens'
                      ? 'text-amber-300 bg-[#2D1B0E] border-b-2 border-amber-400'
                      : 'text-amber-800 hover:text-amber-500'
                  }`}
                >
                  TOKENS
                </button>
                <button
                  onClick={() => setSidePanel('stats')}
                  className={`flex-1 py-1.5 font-pixel text-[6px] transition-colors ${
                    sidePanel === 'stats'
                      ? 'text-amber-300 bg-[#2D1B0E] border-b-2 border-amber-400'
                      : 'text-amber-800 hover:text-amber-500'
                  }`}
                >
                  STATS
                </button>
              </div>
              {/* Panel content */}
              <div className="flex-1 min-h-0">
                {sidePanel === 'activity' && <ActivityLog />}
                {sidePanel === 'tokens' && <TokenUsagePanel />}
                {sidePanel === 'stats' && <StatsPanel />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom: Command bar */}
      <CommandBar onSend={handleCommand} />

      {/* Overlays */}
      <BoardExpandedView />
      <AgentSettingsModal />
      <ToastContainer />

      {/* Chat Panel */}
      {chatOpen && (
        <ChatPanel
          targetAgent={chatTarget}
          onClose={handleCloseChat}
          onSend={handleSendChat}
        />
      )}
    </div>
  );
}
