const { Router } = require('express');
const docker = require('../docker');

const router = Router();

router.get('/df', async (req, res) => {
  try {
    const df = await docker.getSystemDf();
    res.json(df);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener uso de disco', details: err.message });
  }
});

router.get('/prune-preview', async (req, res) => {
  try {
    const df = await docker.getSystemDf();
    const containers = await docker.listContainers();
    const images = await docker.listImages();
    const volumes = await docker.listVolumes();

    const stoppedContainers = containers.filter((c) => c.state !== 'running');
    const unusedImages = images.filter((img) => !img.inUse);
    const orphanVolumes = volumes.filter((v) => v.isOrphan);

    const preview = {
      containers: {
        count: stoppedContainers.length,
        items: stoppedContainers.map((c) => ({ id: c.id, name: c.name, image: c.image })),
      },
      images: {
        count: unusedImages.length,
        size: docker.parseMemory(unusedImages.reduce((sum, i) => sum + i.size.bytes, 0)),
        items: unusedImages.map((i) => ({ id: i.id, name: i.name, size: i.size })),
      },
      volumes: {
        count: orphanVolumes.length,
        items: orphanVolumes.map((v) => ({ name: v.name, isAnonymous: v.isAnonymous })),
      },
      buildCache: {
        size: df.buildCache.reclaimable,
      },
      totalReclaimable: df.totalReclaimable,
    };

    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar preview', details: err.message });
  }
});

router.post('/prune', async (req, res) => {
  try {
    const target = req.query.target || 'all';
    const results = {};

    if (target === 'all' || target === 'containers') {
      results.containers = await docker.pruneContainers();
    }
    if (target === 'all' || target === 'images') {
      results.images = await docker.pruneImages();
    }
    if (target === 'all' || target === 'volumes') {
      results.volumes = await docker.pruneVolumes();
    }
    if (target === 'all' || target === 'buildcache') {
      results.buildCache = await docker.pruneBuildCache();
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: 'Error durante limpieza', details: err.message });
  }
});

module.exports = router;
