const { Router } = require('express');
const docker = require('../docker');
const { getImageDescription, detectStack, getContainerUrls, getContainerRole } = require('../impact');

const router = Router();

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write('data: {"type":"connected"}\n\n');

  let isActive = true;

  const sendStats = async () => {
    if (!isActive) return;

    try {
      const containers = await docker.listContainers();
      const statsMap = await docker.getAllStats(containers);

      const enriched = containers.map((c) => {
        const stats = statsMap[c.id] || null;
        return {
          id: c.id,
          name: c.name,
          image: c.image,
          state: c.state,
          status: c.status,
          description: getImageDescription(c.image),
          stack: detectStack(c),
          urls: getContainerUrls(c.ports),
          role: getContainerRole(c.image, c.name, c.ports),
          cpuPercent: stats ? stats.cpuPercent : null,
          memUsage: stats ? stats.memUsage : null,
          memLimit: stats ? stats.memLimit : null,
          memPercent: stats ? stats.memPercent : null,
        };
      });

      const running = enriched.filter((c) => c.state === 'running');
      const stopped = enriched.filter((c) => c.state !== 'running');

      const totalCpu = running.reduce((sum, c) => sum + (c.cpuPercent || 0), 0);
      const totalMem = running.reduce((sum, c) => sum + (c.memUsage ? c.memUsage.bytes : 0), 0);
      const memLimit = running.length > 0 && running[0].memLimit ? running[0].memLimit.bytes : 0;

      const payload = {
        type: 'stats',
        timestamp: new Date().toISOString(),
        containers: enriched,
        summary: {
          total: enriched.length,
          running: running.length,
          stopped: stopped.length,
          totalCpuPercent: Math.round(totalCpu * 100) / 100,
          totalMemUsage: docker.parseMemory(totalMem),
          totalMemLimit: docker.parseMemory(memLimit),
          totalMemPercent: memLimit > 0 ? Math.round((totalMem / memLimit) * 10000) / 100 : 0,
        },
      };

      if (isActive) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (err) {
      if (isActive) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      }
    }
  };

  sendStats();
  const interval = setInterval(sendStats, 3000);

  req.on('close', () => {
    isActive = false;
    clearInterval(interval);
  });
});

module.exports = router;
