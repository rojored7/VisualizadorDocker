const { Router } = require('express');
const docker = require('../docker');
const { analyzeImageImpact, getImageDescription } = require('../impact');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const images = await docker.listImages();
    const enriched = images.map((img) => ({
      ...img,
      description: getImageDescription(img.name),
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo listar imagenes', details: err.message });
  }
});

router.get('/:id/impact', async (req, res) => {
  try {
    const images = await docker.listImages();
    const containers = await docker.listContainers();
    const impact = await analyzeImageImpact(req.params.id, images, containers);
    if (!impact) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    res.json(impact);
  } catch (err) {
    res.status(500).json({ error: 'Error al analizar impacto', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    await docker.removeImage(req.params.id, force);
    res.json({ success: true, message: 'Imagen eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar imagen', details: err.message });
  }
});

module.exports = router;
