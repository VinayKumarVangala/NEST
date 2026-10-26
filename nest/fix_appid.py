with open('src/renderer/features/projects/ProjectDetails.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''const [healthHistory, setHealthHistory] = useState<HealthHistoryEntry[]>([]);

  const { data: app, isLoading: appLoading } = useQuery<ApplicationConfig>({'''

new = '''const [healthHistory, setHealthHistory] = useState<HealthHistoryEntry[]>([]);

  // Early return if appId is not available
  if (!appId) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Application ID not found
      </div>
    );
  }

  const { data: app, isLoading: appLoading } = useQuery<ApplicationConfig>({'''

content = content.replace(old, new)

with open('src/renderer/features/projects/ProjectDetails.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')