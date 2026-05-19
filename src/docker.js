const Docker = require('dockerode');
const fs = require('fs');

function createDockerClient() {
  const pipes = [
    '//./pipe/dockerDesktopLinuxEngine',
    '//./pipe/docker_engine',
  ];

  for (const pipe of pipes) {
    try {
      if (fs.existsSync(pipe)) {
        return new Docker({ socketPath: pipe });
      }
    } catch (_) {}
  }

  return new Docker();
}

const docker = createDockerClient();

function calculateCpuPercent(stats) {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus =
    stats.cpu_stats.online_cpus ||
    (stats.cpu_stats.cpu_usage.percpu_usage
      ? stats.cpu_stats.cpu_usage.percpu_usage.length
      : 1);
  if (systemDelta > 0 && cpuDelta >= 0) {
    return (cpuDelta / systemDelta) * numCpus * 100;
  }
  return 0;
}

function parseMemory(bytes) {
  if (!bytes || bytes === 0) return { bytes: 0, mb: 0, gb: 0, display: '0 B' };
  const mb = bytes / (1024 * 1024);
  const gb = bytes / (1024 * 1024 * 1024);
  const display = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  return { bytes, mb, gb, display };
}

function extractName(container) {
  if (container.Names && container.Names.length > 0) {
    return container.Names[0].replace(/^\//, '');
  }
  return container.Name ? container.Name.replace(/^\//, '') : container.Id.slice(0, 12);
}

async function listContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => ({
    id: c.Id,
    name: extractName(c),
    image: c.Image,
    imageId: c.ImageID,
    state: c.State,
    status: c.Status,
    created: c.Created,
    ports: c.Ports,
    labels: c.Labels || {},
    mounts: (c.Mounts || []).map((m) => ({
      type: m.Type,
      name: m.Name || null,
      source: m.Source,
      destination: m.Destination,
    })),
    networkMode: c.HostConfig ? c.HostConfig.NetworkMode : null,
    networks: c.NetworkSettings ? Object.keys(c.NetworkSettings.Networks || {}) : [],
  }));
}

async function inspectContainer(id) {
  const container = docker.getContainer(id);
  return container.inspect();
}

async function startContainer(id) {
  const container = docker.getContainer(id);
  await container.start();
}

async function stopContainer(id) {
  const container = docker.getContainer(id);
  await container.stop();
}

async function restartContainer(id) {
  const container = docker.getContainer(id);
  await container.restart();
}

async function removeContainer(id, force = false) {
  const container = docker.getContainer(id);
  await container.remove({ force });
}

async function getContainerLogs(id, tail = 200) {
  const container = docker.getContainer(id);
  const logBuffer = await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
    tail,
    timestamps: true,
  });

  const raw = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(logBuffer);
  const lines = [];
  let offset = 0;

  while (offset < raw.length) {
    if (offset + 8 > raw.length) break;
    const size = raw.readUInt32BE(offset + 4);
    if (offset + 8 + size > raw.length) break;
    const line = raw.slice(offset + 8, offset + 8 + size).toString('utf8');
    lines.push(line.trimEnd());
    offset += 8 + size;
  }

  if (lines.length === 0 && raw.length > 0) {
    return raw.toString('utf8').split('\n').filter(Boolean);
  }

  return lines;
}

async function getContainerStats(id) {
  const container = docker.getContainer(id);
  const stats = await container.stats({ stream: false });

  const cpuPercent = calculateCpuPercent(stats);
  const memUsage = parseMemory(stats.memory_stats.usage || 0);
  const memLimit = parseMemory(stats.memory_stats.limit || 0);
  const memPercent =
    memLimit.bytes > 0 ? (memUsage.bytes / memLimit.bytes) * 100 : 0;

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memUsage,
    memLimit,
    memPercent: Math.round(memPercent * 100) / 100,
  };
}

async function getAllStats(containerList) {
  const running = containerList.filter((c) => c.state === 'running');
  const results = await Promise.allSettled(
    running.map(async (c) => {
      const stats = await getContainerStats(c.id);
      return { id: c.id, ...stats };
    })
  );

  const statsMap = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      statsMap[result.value.id] = result.value;
    }
  }
  return statsMap;
}

async function listImages() {
  const images = await docker.listImages({ all: false });
  const containers = await docker.listContainers({ all: true });

  const usedImageIds = new Set();
  for (const c of containers) {
    if (c.ImageID) usedImageIds.add(c.ImageID);
  }

  return images.map((img) => {
    const repoTags = img.RepoTags || ['<none>:<none>'];
    const repoDigests = img.RepoDigests || [];
    const name =
      repoTags[0] !== '<none>:<none>'
        ? repoTags[0]
        : repoDigests.length > 0
          ? repoDigests[0].split('@')[0]
          : img.Id.slice(7, 19);

    return {
      id: img.Id,
      name,
      tags: repoTags,
      size: parseMemory(img.Size),
      created: img.Created,
      inUse: usedImageIds.has(img.Id),
      containers: containers
        .filter((c) => c.ImageID === img.Id)
        .map((c) => ({ id: c.Id, name: extractName(c), state: c.State })),
    };
  });
}

async function removeImage(id, force = false) {
  const image = docker.getImage(id);
  await image.remove({ force });
}

async function listVolumes() {
  const { Volumes } = await docker.listVolumes();
  const containers = await docker.listContainers({ all: true });

  const volumeUsage = {};
  for (const c of containers) {
    for (const m of c.Mounts || []) {
      const volName = m.Name || m.Source;
      if (!volumeUsage[volName]) volumeUsage[volName] = [];
      volumeUsage[volName].push({
        id: c.Id,
        name: extractName(c),
        state: c.State,
      });
    }
  }

  return (Volumes || []).map((v) => {
    const isAnonymous = /^[a-f0-9]{64}$/.test(v.Name);
    const usedBy = volumeUsage[v.Name] || [];

    return {
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      labels: v.Labels || {},
      created: v.CreatedAt,
      isAnonymous,
      isOrphan: usedBy.length === 0,
      usedBy,
    };
  });
}

async function removeVolume(name) {
  const volume = docker.getVolume(name);
  await volume.remove();
}

async function getSystemDf() {
  const df = await docker.df();

  const imagesSize = (df.Images || []).reduce((sum, i) => sum + (i.Size || 0), 0);
  const imagesReclaimable = (df.Images || []).reduce(
    (sum, i) => (i.Containers === 0 ? sum + (i.Size || 0) : sum),
    0
  );

  const volumesSize = (df.Volumes || []).reduce(
    (sum, v) => sum + (v.UsageData ? v.UsageData.Size : 0),
    0
  );
  const volumesReclaimable = (df.Volumes || []).reduce(
    (sum, v) =>
      v.UsageData && v.UsageData.RefCount === 0
        ? sum + v.UsageData.Size
        : sum,
    0
  );

  const buildCacheSize = (df.BuildCache || []).reduce(
    (sum, b) => sum + (b.Size || 0),
    0
  );
  const buildCacheReclaimable = (df.BuildCache || []).reduce(
    (sum, b) => (!b.InUse ? sum + (b.Size || 0) : sum),
    0
  );

  const containersSize = (df.Containers || []).reduce(
    (sum, c) => sum + (c.SizeRw || 0),
    0
  );

  return {
    images: {
      count: (df.Images || []).length,
      active: (df.Images || []).filter((i) => i.Containers > 0).length,
      size: parseMemory(imagesSize),
      reclaimable: parseMemory(imagesReclaimable),
    },
    volumes: {
      count: (df.Volumes || []).length,
      active: (df.Volumes || []).filter(
        (v) => v.UsageData && v.UsageData.RefCount > 0
      ).length,
      size: parseMemory(volumesSize),
      reclaimable: parseMemory(volumesReclaimable),
    },
    buildCache: {
      count: (df.BuildCache || []).length,
      size: parseMemory(buildCacheSize),
      reclaimable: parseMemory(buildCacheReclaimable),
    },
    containers: {
      count: (df.Containers || []).length,
      running: (df.Containers || []).filter((c) => c.State === 'running').length,
      size: parseMemory(containersSize),
    },
    total: parseMemory(imagesSize + volumesSize + buildCacheSize + containersSize),
    totalReclaimable: parseMemory(
      imagesReclaimable + volumesReclaimable + buildCacheReclaimable
    ),
  };
}

async function pruneContainers() {
  return docker.pruneContainers();
}

async function pruneImages() {
  return docker.pruneImages();
}

async function pruneVolumes() {
  return docker.pruneVolumes();
}

async function pruneBuildCache() {
  return docker.pruneBuilder();
}

async function ping() {
  await docker.ping();
}

module.exports = {
  listContainers,
  inspectContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  getContainerStats,
  getAllStats,
  listImages,
  removeImage,
  listVolumes,
  removeVolume,
  getSystemDf,
  pruneContainers,
  pruneImages,
  pruneVolumes,
  pruneBuildCache,
  ping,
  parseMemory,
};
