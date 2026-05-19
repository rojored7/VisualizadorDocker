const { Router } = require('express');
const docker = require('../docker');
const { analyzeContainerImpact, getImageDescription, detectStack } = require('../impact');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const containers = await docker.listContainers();
    const enriched = containers.map((c) => ({
      ...c,
      description: getImageDescription(c.image),
      stack: detectStack(c),
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo listar contenedores', details: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const info = await docker.inspectContainer(req.params.id);
    res.json(info);
  } catch (err) {
    const status = err.statusCode === 404 ? 404 : 500;
    res.status(status).json({ error: 'Contenedor no encontrado', details: err.message });
  }
});

router.get('/:id/impact', async (req, res) => {
  try {
    const containers = await docker.listContainers();
    const impact = await analyzeContainerImpact(req.params.id, containers);
    if (!impact) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }
    res.json(impact);
  } catch (err) {
    res.status(500).json({ error: 'Error al analizar impacto', details: err.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const tail = parseInt(req.query.tail, 10) || 200;
    const logs = await docker.getContainerLogs(req.params.id, tail);
    res.json({ logs });
  } catch (err) {
    const status = err.statusCode === 404 ? 404 : 500;
    res.status(status).json({ error: 'Error al obtener logs', details: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    await docker.startContainer(req.params.id);
    res.json({ success: true, message: 'Contenedor iniciado' });
  } catch (err) {
    if (err.statusCode === 304) {
      return res.json({ success: true, message: 'El contenedor ya estaba corriendo' });
    }
    res.status(500).json({ error: 'Error al iniciar contenedor', details: err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    await docker.stopContainer(req.params.id);
    res.json({ success: true, message: 'Contenedor detenido' });
  } catch (err) {
    if (err.statusCode === 304) {
      return res.json({ success: true, message: 'El contenedor ya estaba detenido' });
    }
    res.status(500).json({ error: 'Error al detener contenedor', details: err.message });
  }
});

router.post('/:id/restart', async (req, res) => {
  try {
    await docker.restartContainer(req.params.id);
    res.json({ success: true, message: 'Contenedor reiniciado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al reiniciar contenedor', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    await docker.removeContainer(req.params.id, force);
    res.json({ success: true, message: 'Contenedor eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar contenedor', details: err.message });
  }
});

module.exports = router;
