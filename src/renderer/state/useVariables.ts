import React from 'react';
import { IPC, type VariablesSnapshot } from '@shared/ipc';

export function useVariables() {
  const [vars, setVars] = React.useState<VariablesSnapshot>({ values: {}, counters: {} });
  React.useEffect(() => {
    let alive = true;
    void window.api.variables.all().then((v) => { if (alive) setVars(v); });
    const off = window.api.on(IPC.variablesChanged, (v) => setVars(v as VariablesSnapshot));
    return () => { alive = false; off(); };
  }, []);
  const resetSession = React.useCallback(() => window.api.variables.resetSession(), []);
  return { values: vars.values, counters: vars.counters, resetSession };
}
