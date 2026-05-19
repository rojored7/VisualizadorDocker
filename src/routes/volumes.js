const { Router } = require('express');
const docker = require('../docker');
const { analyzeVolumeImpact, getVolumeType } = require('../impact');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const volumes = await docker.listVolumes();
    const enriched = volumes.map((v) => ({
      ...v,
      dataType: getVolumeType(v.name).type,
      dataRisk: getVolumeType(v.name).risk,
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo listar volumenes', details: err.message });
  }
});

router.get('/:name/impact', async (req, res) => {
  try {
    const volumes = await docker.listVolumes();
    const containers = await docker.listContainers();
    const impact = await analyzeVolumeImpact(req.params.name, volumes, containers);
    if (!impact) {
      return res.status(404).json({ error: 'Volumen no encontrado' });
    }
    res.json(impact);
  } catch (err) {
    res.status(500).json({ error: 'Error al analizar impacto', details: err.message });
  }
});

router.delete('/:name', async (req, res) => {
  try {
    await docker.removeVolume(req.params.name);
    res.json({ success: true, message: 'Volumen eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar volumen', details: err.message });
  }
});

module.exports = router;
