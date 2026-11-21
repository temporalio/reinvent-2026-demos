/** Read only explicit process settings; never a developer's Cloud profile. */
export function temporalSettings(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.TEMPORAL_API_KEY || undefined;
  const tls = env.TEMPORAL_TLS === undefined ? Boolean(apiKey) : ['true', '1', 'yes'].includes(env.TEMPORAL_TLS.toLowerCase());
  if (apiKey && !tls) throw new Error('TLS is required when TEMPORAL_API_KEY is set');
  return {
    address: env.TEMPORAL_ADDRESS || env.TEMPORAL_ENDPOINT || 'localhost:7233',
    namespace: env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: env.TEMPORAL_TASK_QUEUE || 'dejavu-tacos',
    tls,
    apiKey,
  };
}
