import { bootstrap, createLogger } from '@agent/core';
import { createDashboardServer } from '@agent/dashboard-server';
import { createAgentFactories } from './agent-factories.js';
import { createDashboardDeps } from './dashboard-adapter.js';

const log = createLogger('Main');

async function main() {
  log.info('Starting agent orchestration system...');

  const context = await bootstrap({
    agents: createAgentFactories(),
  });

  log.info(
    { agentCount: context.agents.length, agents: context.agents.map((a) => a.id) },
    'System started successfully',
  );

  // Dashboard server 시작
  const dashboardPort = Number(process.env.DASHBOARD_PORT) || 3001;
  const dashboardDeps = createDashboardDeps(
    context.stateStore,
    context.messageBus,
    context.agents,
  );
  const dashboard = createDashboardServer(dashboardDeps);
  await dashboard.listen(dashboardPort);

  log.info({ port: dashboardPort }, 'Dashboard server started');
  log.info(`  REST API:   http://localhost:${dashboardPort}/api`);
  log.info(`  WebSocket:  ws://localhost:${dashboardPort}`);
  log.info(`  Health:     http://localhost:${dashboardPort}/health`);

  // Graceful shutdown에 dashboard 포함
  const originalShutdown = context.shutdown;
  context.shutdown = async () => {
    await dashboard.close();
    await originalShutdown();
  };
}

main().catch((err) => {
  log.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
