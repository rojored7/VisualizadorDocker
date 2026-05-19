const IMAGE_DESCRIPTIONS = {
  postgres: 'Base de datos relacional PostgreSQL',
  postgresql: 'Base de datos relacional PostgreSQL',
  mysql: 'Base de datos relacional MySQL',
  mariadb: 'Base de datos relacional MariaDB',
  mongo: 'Base de datos NoSQL orientada a documentos',
  mongodb: 'Base de datos NoSQL orientada a documentos',
  redis: 'Cache en memoria / message broker',
  memcached: 'Cache en memoria distribuido',
  nginx: 'Servidor web / proxy reverso',
  apache: 'Servidor web Apache',
  httpd: 'Servidor web Apache HTTPD',
  traefik: 'Proxy reverso / load balancer',
  caddy: 'Servidor web con HTTPS automatico',
  sonarqube: 'Herramienta de analisis de calidad de codigo',
  n8n: 'Plataforma de automatizacion de workflows',
  'n8nio/n8n': 'Plataforma de automatizacion de workflows',
  mailhog: 'Servidor de email para testing (no envia emails reales)',
  mailpit: 'Servidor de email para testing',
  pgadmin: 'Interfaz web para administrar PostgreSQL',
  'dpage/pgadmin4': 'Interfaz web para administrar PostgreSQL',
  adminer: 'Interfaz web para administrar bases de datos',
  phpmyadmin: 'Interfaz web para administrar MySQL',
  ollama: 'Motor local para ejecutar modelos de IA/LLM',
  'ollama/ollama': 'Motor local para ejecutar modelos de IA/LLM',
  minio: 'Almacenamiento de objetos compatible con S3',
  'minio/minio': 'Almacenamiento de objetos compatible con S3',
  glitchtip: 'Monitoreo de errores (alternativa a Sentry)',
  sentry: 'Monitoreo de errores y rendimiento',
  rabbitmq: 'Message broker para comunicacion entre servicios',
  kafka: 'Plataforma de streaming de eventos',
  zookeeper: 'Coordinacion de servicios distribuidos',
  elasticsearch: 'Motor de busqueda y analisis',
  kibana: 'Visualizacion de datos de Elasticsearch',
  grafana: 'Dashboard de monitoreo y observabilidad',
  prometheus: 'Monitoreo y sistema de alertas',
  jenkins: 'Servidor de integracion continua (CI/CD)',
  gitea: 'Servidor Git ligero auto-hospedado',
  gitlab: 'Plataforma DevOps completa',
  portainer: 'Interfaz de gestion de Docker',
  watchtower: 'Actualizacion automatica de contenedores',
  vault: 'Gestion de secretos y cifrado',
  consul: 'Service discovery y configuracion',
  haproxy: 'Load balancer de alto rendimiento',
  node: 'Runtime de JavaScript (Node.js)',
  python: 'Runtime de Python',
  ruby: 'Runtime de Ruby',
  golang: 'Runtime de Go',
  java: 'Runtime de Java',
  openjdk: 'Runtime de Java (OpenJDK)',
  ubuntu: 'Contenedor base Ubuntu Linux',
  alpine: 'Contenedor base Alpine Linux (minimo)',
  debian: 'Contenedor base Debian Linux',
  busybox: 'Utilidades Linux minimas',
};

const VOLUME_PATTERNS = [
  { pattern: /postgres[_-]?data|pg[_-]?data|[_-]db$/i, type: 'Datos de base de datos PostgreSQL', risk: 'high' },
  { pattern: /mysql[_-]?data/i, type: 'Datos de base de datos MySQL', risk: 'high' },
  { pattern: /mongo[_-]?data/i, type: 'Datos de base de datos MongoDB', risk: 'high' },
  { pattern: /redis[_-]?data/i, type: 'Cache Redis', risk: 'medium' },
  { pattern: /minio[_-]?data/i, type: 'Almacenamiento de archivos (S3)', risk: 'high' },
  { pattern: /upload|uploads|backend[_-]uploads/i, type: 'Archivos subidos por usuarios', risk: 'high' },
  { pattern: /log|logs|nginx[_-]logs|backend[_-]logs/i, type: 'Archivos de log', risk: 'low' },
  { pattern: /pgadmin[_-]?data/i, type: 'Configuracion de PgAdmin', risk: 'low' },
  { pattern: /sonarqube/i, type: 'Datos de SonarQube', risk: 'medium' },
  { pattern: /grafana/i, type: 'Dashboards y configuracion de Grafana', risk: 'medium' },
  { pattern: /prometheus/i, type: 'Metricas de Prometheus', risk: 'medium' },
  { pattern: /elasticsearch|elastic/i, type: 'Indices de Elasticsearch', risk: 'high' },
  { pattern: /rabbitmq/i, type: 'Datos de RabbitMQ', risk: 'medium' },
  { pattern: /kafka/i, type: 'Datos de Kafka', risk: 'high' },
  { pattern: /ollama/i, type: 'Modelos de IA descargados', risk: 'medium' },
  { pattern: /cache/i, type: 'Cache de aplicacion', risk: 'low' },
  { pattern: /node[_-]modules/i, type: 'Dependencias Node.js', risk: 'low' },
];

function getImageDescription(imageName) {
  if (!imageName) return 'Imagen desconocida';

  const lower = imageName.toLowerCase();

  for (const [key, desc] of Object.entries(IMAGE_DESCRIPTIONS)) {
    if (lower === key || lower.startsWith(key + ':') || lower.startsWith(key + '/') || lower.includes('/' + key + ':') || lower.includes('/' + key)) {
      return desc;
    }
  }

  const parts = imageName.split('/');
  const baseName = parts[parts.length - 1].split(':')[0];

  for (const [key, desc] of Object.entries(IMAGE_DESCRIPTIONS)) {
    if (baseName.toLowerCase() === key) return desc;
  }

  if (imageName.includes('/')) {
    return `Imagen del proyecto ${parts[0]}`;
  }

  return `Imagen personalizada: ${baseName}`;
}

function getVolumeType(volumeName) {
  if (!volumeName) return { type: 'Tipo desconocido', risk: 'medium' };

  if (/^[a-f0-9]{64}$/.test(volumeName)) {
    return { type: 'Volumen temporal/anonimo', risk: 'low' };
  }

  for (const { pattern, type, risk } of VOLUME_PATTERNS) {
    if (pattern.test(volumeName)) return { type, risk };
  }

  return { type: 'Datos de aplicacion', risk: 'medium' };
}

function detectStack(container) {
  const labels = container.labels || {};

  const composeProject = labels['com.docker.compose.project'];
  if (composeProject) return composeProject;

  const name = container.name || '';
  const dashIdx = name.indexOf('-');
  const underIdx = name.indexOf('_');

  if (underIdx > 0 && (dashIdx < 0 || underIdx < dashIdx)) {
    return name.substring(0, underIdx);
  }
  if (dashIdx > 0) {
    return name.substring(0, dashIdx);
  }

  return null;
}

function groupByStack(containers) {
  const stacks = {};
  for (const c of containers) {
    const stack = detectStack(c);
    const key = stack || '__standalone__';
    if (!stacks[key]) stacks[key] = [];
    stacks[key].push(c);
  }
  return stacks;
}

function getRiskLevel(factors) {
  if (factors.some((f) => f.risk === 'high')) return 'PELIGROSO';
  if (factors.some((f) => f.risk === 'medium')) return 'PRECAUCION';
  return 'SEGURO';
}

function getRiskColor(level) {
  switch (level) {
    case 'PELIGROSO': return '#e74c3c';
    case 'PRECAUCION': return '#f39c12';
    case 'SEGURO': return '#27ae60';
    default: return '#95a5a6';
  }
}

async function analyzeContainerImpact(containerId, allContainers) {
  const container = allContainers.find((c) => c.id === containerId);
  if (!container) return null;

  const factors = [];
  const warnings = [];

  if (container.state === 'running') {
    factors.push({ risk: 'medium', message: 'El contenedor esta corriendo actualmente' });
    warnings.push('Se detendra antes de eliminarse');
  }

  const stack = detectStack(container);
  if (stack) {
    const stackContainers = allContainers.filter((c) => detectStack(c) === stack && c.id !== containerId);
    if (stackContainers.length > 0) {
      const runningInStack = stackContainers.filter((c) => c.state === 'running');
      factors.push({
        risk: runningInStack.length > 0 ? 'high' : 'medium',
        message: `Pertenece al stack "${stack}" con ${stackContainers.length} contenedores mas (${runningInStack.length} corriendo)`,
      });
      warnings.push('Otros servicios del mismo stack podrian dejar de funcionar');
    }
  }

  const orphanVolumes = [];
  for (const mount of container.mounts || []) {
    if (mount.name) {
      const otherUsers = allContainers.filter(
        (c) => c.id !== containerId && (c.mounts || []).some((m) => m.name === mount.name)
      );
      if (otherUsers.length === 0) {
        const volType = getVolumeType(mount.name);
        orphanVolumes.push({ name: mount.name, ...volType });
        if (volType.risk === 'high') {
          factors.push({ risk: 'high', message: `Volumen "${mount.name}" (${volType.type}) quedara huerfano` });
        }
      }
    }
  }

  const riskLevel = container.state === 'exited' && orphanVolumes.length === 0 && !stack
    ? 'SEGURO'
    : getRiskLevel(factors);

  return {
    container: { id: container.id, name: container.name, image: container.image, state: container.state },
    description: getImageDescription(container.image),
    stack,
    riskLevel,
    riskColor: getRiskColor(riskLevel),
    factors,
    warnings,
    orphanVolumes,
  };
}

async function analyzeImageImpact(imageId, allImages, allContainers) {
  const image = allImages.find((i) => i.id === imageId);
  if (!image) return null;

  const factors = [];
  const warnings = [];

  const dependentContainers = allContainers.filter((c) => c.imageId === imageId);
  const runningDeps = dependentContainers.filter((c) => c.state === 'running');
  const stoppedDeps = dependentContainers.filter((c) => c.state !== 'running');

  if (runningDeps.length > 0) {
    factors.push({
      risk: 'high',
      message: `${runningDeps.length} contenedor(es) corriendo usan esta imagen`,
    });
    warnings.push('No se puede eliminar mientras haya contenedores activos usandola');
  }

  if (stoppedDeps.length > 0) {
    factors.push({
      risk: 'medium',
      message: `${stoppedDeps.length} contenedor(es) detenidos dependen de esta imagen`,
    });
    warnings.push('Esos contenedores no podran reiniciarse si eliminas la imagen');
  }

  const riskLevel = dependentContainers.length === 0
    ? 'SEGURO'
    : getRiskLevel(factors);

  return {
    image: { id: image.id, name: image.name, size: image.size },
    description: getImageDescription(image.name),
    riskLevel,
    riskColor: getRiskColor(riskLevel),
    factors,
    warnings,
    dependentContainers: dependentContainers.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
    })),
    spaceFreed: image.size,
  };
}

async function analyzeVolumeImpact(volumeName, allVolumes, allContainers) {
  const volume = allVolumes.find((v) => v.name === volumeName);
  if (!volume) return null;

  const factors = [];
  const warnings = [];

  const volType = getVolumeType(volumeName);

  if (volume.usedBy.length > 0) {
    const runningUsers = volume.usedBy.filter((c) => c.state === 'running');
    if (runningUsers.length > 0) {
      factors.push({
        risk: 'high',
        message: `${runningUsers.length} contenedor(es) corriendo montan este volumen`,
      });
      warnings.push('No se puede eliminar mientras este montado en contenedores activos');
    } else {
      factors.push({
        risk: 'medium',
        message: `${volume.usedBy.length} contenedor(es) detenidos usan este volumen`,
      });
    }
  }

  if (volType.risk === 'high') {
    factors.push({ risk: 'high', message: `Contiene ${volType.type} - datos potencialmente irrecuperables` });
    warnings.push('Hacer backup antes de eliminar');
  } else if (volType.risk === 'medium') {
    factors.push({ risk: 'medium', message: `Contiene ${volType.type}` });
  }

  const riskLevel = volume.isAnonymous && volume.isOrphan
    ? 'SEGURO'
    : getRiskLevel(factors);

  return {
    volume: { name: volume.name, driver: volume.driver, isAnonymous: volume.isAnonymous, isOrphan: volume.isOrphan },
    dataType: volType.type,
    riskLevel,
    riskColor: getRiskColor(riskLevel),
    factors,
    warnings,
    usedBy: volume.usedBy,
  };
}

const SERVICE_PORTS = {
  5432: { label: 'PostgreSQL', type: 'service', tip: 'Solo conexion con cliente DB (pgAdmin, DBeaver, etc.)' },
  3306: { label: 'MySQL', type: 'service', tip: 'Solo conexion con cliente DB' },
  27017: { label: 'MongoDB', type: 'service', tip: 'Solo conexion con cliente DB (Compass, mongosh)' },
  6379: { label: 'Redis', type: 'service', tip: 'Solo conexion con redis-cli o RedisInsight' },
  5672: { label: 'RabbitMQ AMQP', type: 'service', tip: 'Protocolo de mensajeria, no tiene interfaz web' },
  11211: { label: 'Memcached', type: 'service', tip: 'Solo conexion por protocolo' },
  11434: { label: 'Ollama API', type: 'api', tip: 'API REST para modelos LLM. Usar con curl o clientes compatibles' },
};

const WEB_UI_IMAGES = new Set([
  'nginx', 'apache', 'httpd', 'traefik', 'caddy',
  'sonarqube', 'n8n', 'n8nio/n8n',
  'mailhog', 'mailpit',
  'pgadmin', 'dpage/pgadmin4',
  'adminer', 'phpmyadmin',
  'minio', 'minio/minio',
  'glitchtip', 'sentry',
  'grafana', 'prometheus',
  'kibana', 'jenkins',
  'gitea', 'gitlab',
  'portainer', 'rabbitmq',
  'vault', 'consul',
]);

function getContainerUrls(ports) {
  if (!ports || ports.length === 0) return [];

  const urls = [];
  const seen = new Set();

  for (const p of ports) {
    if (!p.PublicPort || p.Type !== 'tcp') continue;
    if (seen.has(p.PublicPort)) continue;
    seen.add(p.PublicPort);

    const known = SERVICE_PORTS[p.PublicPort];
    if (known) {
      urls.push({
        url: known.type === 'api' ? `http://localhost:${p.PublicPort}` : null,
        port: p.PublicPort,
        privatePort: p.PrivatePort,
        label: known.label,
        type: known.type,
        tip: known.tip,
      });
      continue;
    }

    const url = `http://localhost:${p.PublicPort}`;
    let type = 'web';
    let label = `Puerto ${p.PublicPort}`;

    if (p.PrivatePort === 80 || p.PrivatePort === 443 || p.PrivatePort === 3000 || p.PrivatePort === 8080) {
      type = 'web';
      label = 'Interfaz web';
    } else if (p.PublicPort >= 8000 && p.PublicPort <= 8999) {
      type = 'api';
      label = 'API';
    } else if (p.PublicPort >= 9000 && p.PublicPort <= 9999) {
      type = 'admin';
      label = 'Panel de administracion';
    } else if (p.PublicPort >= 15000 && p.PublicPort <= 15999) {
      type = 'admin';
      label = 'Management UI';
    }

    urls.push({
      url,
      port: p.PublicPort,
      privatePort: p.PrivatePort,
      label,
      type,
      tip: type === 'web' ? 'Abrir en el navegador' : type === 'api' ? 'Endpoint API REST' : 'Panel de administracion',
    });
  }

  return urls;
}

function getContainerRole(imageName, containerName, ports) {
  const name = (containerName || '').toLowerCase();
  const img = (imageName || '').toLowerCase();

  let role = null;
  let hasWebUI = false;
  let tip = '';

  if (name.includes('frontend') || name.includes('front')) {
    role = 'Frontend web';
    hasWebUI = true;
    tip = 'Aplicacion web accesible desde el navegador';
  } else if (name.includes('backend') || name.includes('back') || name.includes('api') || name.includes('fastapi')) {
    role = 'Backend / API';
    hasWebUI = false;
    tip = 'Servicio de backend que expone endpoints API';
  } else if (name.includes('worker') || name.includes('executor') || name.includes('celery') || name.includes('consumer')) {
    role = 'Worker / Procesamiento';
    hasWebUI = false;
    tip = 'Proceso en background que ejecuta tareas asincronas';
  } else if (name.includes('nginx') || img.includes('nginx') || img.includes('traefik') || img.includes('caddy')) {
    role = 'Proxy reverso / Entry point';
    hasWebUI = true;
    tip = 'Recibe el trafico web y lo redirige a los servicios internos';
  } else if (name.includes('postgres') || name.includes('db') || img.includes('postgres')) {
    role = 'Base de datos';
    hasWebUI = false;
    tip = 'Almacena datos persistentes. Conectar con un cliente de DB';
  } else if (img.includes('redis')) {
    role = 'Cache / Broker';
    hasWebUI = false;
    tip = 'Cache en memoria para acelerar el sistema';
  } else if (img.includes('mysql') || img.includes('mariadb') || img.includes('mongo')) {
    role = 'Base de datos';
    hasWebUI = false;
    tip = 'Almacena datos persistentes. Conectar con un cliente de DB';
  }

  if (!role) {
    for (const [key, _] of Object.entries(IMAGE_DESCRIPTIONS)) {
      if (img === key || img.startsWith(key + ':') || img.includes('/' + key)) {
        if (WEB_UI_IMAGES.has(key)) {
          hasWebUI = true;
        }
        role = getImageDescription(imageName);
        break;
      }
    }
  }

  if (!role) {
    role = getImageDescription(imageName);
  }

  if (!hasWebUI && ports && ports.length > 0) {
    const webPorts = ports.filter((p) =>
      p.PublicPort && p.Type === 'tcp' && !SERVICE_PORTS[p.PublicPort]
    );
    if (webPorts.length > 0) {
      hasWebUI = true;
      if (!tip) tip = 'Tiene puertos web expuestos';
    }
  }

  if (!tip) {
    tip = hasWebUI ? 'Accesible desde el navegador' : 'Servicio interno sin interfaz web';
  }

  return { role, hasWebUI, tip };
}

module.exports = {
  getImageDescription,
  getVolumeType,
  detectStack,
  groupByStack,
  getRiskLevel,
  getRiskColor,
  analyzeContainerImpact,
  analyzeImageImpact,
  analyzeVolumeImpact,
  getContainerUrls,
  getContainerRole,
};
