export const NODE_TYPE_COLORS: Record<string, string> = {
  serviceNode: '#475569',
  databaseNode: '#854d0e',
  cacheNode: '#dc2626',
  queueNode: '#7c3aed',
  gatewayNode: '#059669',
  loadBalancerNode: '#0891b2',
  containerNode: '#3b82f6',
};

export const CONTAINER_COLORS: Record<string, string> = {
  docker_container: '#3b82f6',
  kubernetes_pod: '#8b5cf6',
  vm_instance: '#64748b',
  rack: '#22c55e',
  datacenter: '#f97316',
};

/** NODE_TYPE_COLORS + CONTAINER_COLORS merged (used in PropertiesPanel) */
export const DEFAULT_BORDER_COLORS: Record<string, string> = {
  ...NODE_TYPE_COLORS,
  ...CONTAINER_COLORS,
};

export const LANGUAGE_ICONS: Record<string, string> = {
  go: 'Go',
  java: 'Jv',
  python: 'Py',
  rust: 'Rs',
  typescript: 'TS',
  csharp: 'C#',
  kotlin: 'Kt',
  ruby: 'Rb',
  php: 'php',
  cpp: 'C++',
  scala: 'Sc',
  elixir: 'Ex',
};

export const LANGUAGE_COLORS: Record<string, string> = {
  go: '#00ADD8',
  java: '#ED8B00',
  python: '#3776AB',
  rust: '#DEA584',
  typescript: '#3178C6',
  csharp: '#512BD4',
  kotlin: '#7F52FF',
  ruby: '#CC342D',
  php: '#777BB4',
  cpp: '#00599C',
  scala: '#DC322F',
  elixir: '#6E4A7E',
};
