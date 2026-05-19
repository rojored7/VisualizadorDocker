const express = require('express');
const path = require('path');
const docker = require('./src/docker');

const containersRouter = require('./src/routes/containers');
const imagesRouter = require('./src/routes/images');
const volumesRouter = require('./src/routes/volumes');
const statsRouter = require('./src/routes/stats');
const systemRouter = require('./src/routes/system');

const app = express();
const PORT = process.env.PORT || 4500;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/containers', containersRouter);
app.use('/api/images', imagesRouter);
app.use('/api/volumes', volumesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/system', systemRouter);

app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

async function start() {
  try {
    await docker.ping();
    console.log('Docker Engine conectado');
  } catch (err) {
    console.error('No se pudo conectar a Docker Engine:', err.message);
    console.error('Asegurate de que Docker Desktop este corriendo');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`VisualizadorDocker corriendo en http://localhost:${PORT}`);
  });
}

start();
