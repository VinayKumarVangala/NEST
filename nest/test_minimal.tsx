import { useMutation } from '@tanstack/react-query';

const checkNowMutation = useMutation({
  mutationFn: (id: string) => id,
  onSuccess: (result) => {
    if (result.ok) {
      const entry = {
        timestamp: Date.now(),
      };
    }
  },
});
