// Finish independent cleanup steps even if an optional runtime or backend is unavailable.
export async function shutdownAgent(agent) {
  const warnings = [];
  const attempt = async (step, fn) => {
    try { return await fn(); }
    catch (error) {
      warnings.push({step, message:error.message});
      try { agent.bus.publish('warning', {step, message:`關閉時 ${step} 未完成：${error.message}`}); } catch {}
    }
  };
  clearInterval(agent.timer);
  clearInterval(agent.reminderTimer);
  await attempt('cancel-inference', () => {agent.idleRuntime.cancel();agent.full.cancel?.();});
  await attempt('cancel-companion', () => agent.companion.cancel());
  await attempt('cancel-search', () => agent.browser.close());
  await agent.queue;
  await attempt('save-state', () => agent.lifecycle.save_runtime_state());
  if (agent.modules) await attempt('modules', async () => {
    const errors = await agent.modules.dispose();
    for (const error of errors || []) warnings.push({step:'modules', message:error.message});
  });
  else {
    await attempt('tunnel', () => agent.remote?.tunnel.stop());
    await attempt('gateway', () => agent.remote?.gateway.stop());
  }
  await attempt('perception', () => agent.perception.close());
  if (!agent.modules) await attempt('phone', () => agent.companion.phone?.close());
  for (const role of Object.keys(agent.lifecycle.models || {}))
    await attempt(`unload-${role}`, () => agent.lifecycle.unload_model(role));
  await attempt('checkpoint', () => agent.memory.checkpoint());
  await attempt('close-memory', () => agent.memory.close());
  return {stopped:true, warnings};
}
