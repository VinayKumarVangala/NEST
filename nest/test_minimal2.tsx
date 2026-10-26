import { useMutation } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';

const checkNowMutation = useMutation({
  mutationFn: (id: string) => nest.health.checkNow(id),
  onSuccess: (result) => {
    if (result.ok) {
      const entry = {
        timestamp: Date.now(),
        processAlive: result.data.processAlive,
        portListening: result.data.portListening,
        localResponding: result.data.localResponding,
        latencyMs: result.data.latencyMs,
      };
      setHealthHistory((prev) => [entry, ...prev.slice(0, 99)]);
    }
  },
});
