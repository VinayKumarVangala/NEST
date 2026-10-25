import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, LaunchConfigWarning, HealthCheckConfig } from '@shared/types';
import { FolderPicker } from '@renderer/components/FolderPicker';
import { CopyToClipboard } from '@renderer/components/CopyToClipboard';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface WizardData {
  lifecycleMode: 'managed' | 'external';
  name: string;
  projectPath: string;
  runtimePreset: RuntimePreset;
  executable: string;
  args: string[];
  workingDirectory: string;
  env: EnvVar[];
  port: number;
  protocol: 'http' | 'https';
  expectedListenAddress: 'loopback' | 'all' | 'lan';
  healthCheck: HealthCheckConfig;
  warnings: LaunchConfigWarning[];
}

type RuntimePreset = 'node' | 'npm' | 'python' | 'java' | 'dotnet' | 'custom';

interface EnvVar {
  key: string;
  value: string;
  secret: boolean;
}

type AppCreateConfig = Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>;

const RUNTIME_PRESETS: { value: RuntimePreset; label: string; description: string }[] = [
  { value: 'node', label: 'Node.js', description: 'Direct Node.js execution (node server.js)' },
  { value: 'npm', label: 'npm script', description: 'npm run dev / npm start' },
  { value: 'python', label: 'Python', description: 'python app.py / uvicorn main:app' },
  { value: 'java', label: 'Java', description: 'java -jar app.jar' },
  { value: 'dotnet', label: '.NET', description: 'dotnet run / dotnet app.dll' },
  { value: 'custom', label: 'Custom', description: 'Any executable with custom arguments' },
];

const HEALTH_CHECK_TYPES = [
  { value: 'none', label: 'None', description: 'No health checks' },
  { value: 'tcp', label: 'TCP Port', description: 'Check if port is accepting connections' },
  { value: 'http', label: 'HTTP Endpoint', description: 'GET request to /health or custom path' },
] as const;

interface RegistrationWizardProps {
  onClose: () => void;
  onSubmit: (config: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export function RegistrationWizard({ onClose, onSubmit }: RegistrationWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [formData, setFormData] = useState<WizardData>({
    lifecycleMode: 'managed',
    name: '',
    projectPath: '',
    runtimePreset: 'custom',
    executable: '',
    args: [],
    workingDirectory: '',
    env: [],
    port: 3000,
    protocol: 'http',
    expectedListenAddress: 'loopback',
    healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
    warnings: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lintMutation = useMutation({
    mutationFn: (config: ApplicationConfig) => nest.apps.lintLaunchConfig(config),
    onSuccess: (result) => {
      if (result.ok) {
        setFormData((prev) => ({ ...prev, warnings: result.data }));
      }
    },
  });

  useEffect(() => {
    if (step >= 3) {
      const config = buildConfig();
      lintMutation.mutate(config as ApplicationConfig);
    }
  }, [formData, step]);

  const applyPresetDefaults = (preset: RuntimePreset) => {
    setFormData((prev) => {
      const base = { ...prev };
      switch (preset) {
        case 'node':
          if (!base.executable) base.executable = 'node';
          if (base.args.length === 0) base.args = ['index.js'];
          break;
        case 'npm':
          base.executable = 'npm.cmd';
          if (base.args.length === 0) base.args = ['run', 'dev'];
          break;
        case 'python':
          base.executable = 'python';
          if (base.args.length === 0) base.args = ['app.py'];
          break;
        case 'java':
          base.executable = 'java';
          if (base.args.length === 0) base.args = ['-jar', 'app.jar'];
          break;
        case 'dotnet':
          base.executable = 'dotnet';
          if (base.args.length === 0) base.args = ['run'];
          break;
        case 'custom':
          break;
      }
      return base;
    });
  };

  const updateField = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateNestedField = <T extends object>(
    parent: keyof WizardData,
    field: keyof T,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: { ...(prev[parent] as Record<string, any>), [field]: value },
    }));
  };

  const steps: { title: string; description: string }[] = [
    { title: 'Mode', description: 'Choose how NEST manages this application' },
    { title: 'Basics', description: 'Name and project location' },
    { title: 'Launch', description: 'Runtime, executable, arguments, environment' },
    { title: 'Port & Protocol', description: 'Network configuration' },
    { title: 'Health Check', description: 'How to verify the app is healthy' },
    { title: 'Review', description: 'Review configuration and save' },
  ];

  const canGoNext = () => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return formData.name.trim().length > 0 && formData.projectPath.trim().length > 0;
      case 3:
        return formData.executable.trim().length > 0 && formData.workingDirectory.trim().length > 0;
      case 4:
        return formData.port > 0 && formData.port < 65536;
      case 5:
        return true;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < 6 && canGoNext()) {
      setStep((s) => (s + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as WizardStep);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGoNext()) return;

    setIsSubmitting(true);
    try {
      const config = buildConfig();
      onSubmit(config);
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildConfig = (): AppCreateConfig => {
    const preset = RUNTIME_PRESETS.find((p) => p.value === formData.runtimePreset);
    return {
      name: formData.name,
      projectPath: formData.projectPath,
      runtimeLabel: preset?.label,
      executable: formData.executable,
      args: formData.args,
      workingDirectory: formData.workingDirectory || formData.projectPath,
      env: formData.env.map((e) => ({ key: e.key, value: e.value, secret: e.secret })),
      protocol: formData.protocol,
      port: formData.port,
      expectedListenAddress: formData.expectedListenAddress,
      lifecycleMode: formData.lifecycleMode,
      startupTimeoutMs: 30000,
      healthCheck: formData.healthCheck,
      selectedInterface: undefined,
    };
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Register Application
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Step {step} of {steps.length}: {steps[step - 1].title}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
            aria-label="Close wizard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-col items-center relative">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    i + 1 < step
                      ? 'bg-green-500 text-white'
                      : i + 1 === step
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {i + 1 < step ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs mt-1 truncate w-24 text-center ${
                    i + 1 <= step ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  {s.title}
                </span>
                {i < steps.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 -ml-12 ${
                      i + 1 < step ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    style={{ width: '100%' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {step === 1 && (
            <div className="space-y-4" data-step="1">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[0].description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['managed', 'external'].map((mode) => (
                  <label
                    key={mode}
                    className={`relative cursor-pointer p-4 border-2 rounded-lg transition-all ${
                      formData.lifecycleMode === mode
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="lifecycleMode"
                      value={mode}
                      checked={formData.lifecycleMode === mode}
                      onChange={() => updateField('lifecycleMode', mode as 'managed' | 'external')}
                      className="sr-only"
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                          formData.lifecycleMode === mode
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {formData.lifecycleMode === mode && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white capitalize">
                          {mode === 'managed' ? 'Manage & Launch' : 'Register Running App'}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {mode === 'managed'
                            ? 'NEST starts, stops, monitors, and manages the application lifecycle'
                            : 'Application is already running externally; NEST only monitors it'}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-step="2">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[1].description}</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Application Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="My Web App"
                  required
                />
              </div>
              <FolderPicker
                value={formData.projectPath}
                onChange={(path) => updateField('projectPath', path)}
                label="Project Folder"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-step="3">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[2].description}</p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Runtime Preset
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {RUNTIME_PRESETS.map((preset) => (
                    <label
                      key={preset.value}
                      className={`relative cursor-pointer p-3 border-2 rounded-lg text-left transition-all ${
                        formData.runtimePreset === preset.value
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="runtimePreset"
                        value={preset.value}
                        checked={formData.runtimePreset === preset.value}
                        onChange={() => {
                          updateField('runtimePreset', preset.value);
                          applyPresetDefaults(preset.value);
                        }}
                        className="sr-only"
                      />
                      <div className="font-medium text-slate-900 dark:text-white">
                        {preset.label}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {preset.description}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Executable
                </label>
                <input
                  type="text"
                  value={formData.executable}
                  onChange={(e) => updateField('executable', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="node, python, java, dotnet, or full path"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Arguments (one per line)
                </label>
                <textarea
                  value={formData.args.join('\n')}
                  onChange={(e) =>
                    updateField(
                      'args',
                      e.target.value.split('\n').filter((a) => a.trim())
                    )
                  }
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono text-sm"
                  placeholder="run&#10;dev&#10;--port&#10;3000"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Each line becomes a separate argument. No shell metacharacters needed.
                </p>
              </div>

              <FolderPicker
                value={formData.workingDirectory}
                onChange={(path) => updateField('workingDirectory', path)}
                label="Working Directory"
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Environment Variables
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField('env', [...formData.env, { key: '', value: '', secret: false }])
                    }
                    className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    + Add Variable
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.env.map((envVar, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="KEY"
                        value={envVar.key}
                        onChange={(e) =>
                          updateField(
                            'env',
                            formData.env.map((v, i) =>
                              i === index ? { ...v, key: e.target.value } : v
                            )
                          )
                        }
                        className="w-1/3 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <input
                        type={envVar.secret ? 'password' : 'text'}
                        placeholder="VALUE"
                        value={envVar.value}
                        onChange={(e) =>
                          updateField(
                            'env',
                            formData.env.map((v, i) =>
                              i === index ? { ...v, value: e.target.value } : v
                            )
                          )
                        }
                        className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <label className="flex items-center gap-1 px-2">
                        <input
                          type="checkbox"
                          checked={envVar.secret}
                          onChange={(e) =>
                            updateField(
                              'env',
                              formData.env.map((v, i) =>
                                i === index ? { ...v, secret: e.target.checked } : v
                              )
                            )
                          }
                          className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Secret</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            'env',
                            formData.env.filter((_, i) => i !== index)
                          )
                        }
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        aria-label="Remove variable"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {formData.env.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                      No environment variables set
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-step="4">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[3].description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => updateField('port', parseInt(e.target.value) || 0)}
                    min="1"
                    max="65535"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Protocol
                  </label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => updateField('protocol', e.target.value as 'http' | 'https')}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expected Listen Address
                </label>
                <select
                  value={formData.expectedListenAddress}
                  onChange={(e) =>
                    updateField(
                      'expectedListenAddress',
                      e.target.value as 'loopback' | 'all' | 'lan'
                    )
                  }
                  className="w-full md:w-64 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="loopback">Loopback only (127.0.0.1)</option>
                  <option value="all">All interfaces (0.0.0.0)</option>
                  <option value="lan">LAN interface</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Loopback = local only. All/LAN require firewall changes (Phase 2+).
                </p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-step="5">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[4].description}</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Health Check Type
                </label>
                <div className="space-y-2">
                  {HEALTH_CHECK_TYPES.map((type) => (
                    <label
                      key={type.value}
                      className={`relative cursor-pointer p-3 border-2 rounded-lg transition-all ${
                        formData.healthCheck.type === type.value
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="healthCheckType"
                        value={type.value}
                        checked={formData.healthCheck.type === type.value}
                        onChange={() =>
                          updateNestedField(
                            'healthCheck',
                            'type',
                            type.value as 'none' | 'tcp' | 'http'
                          )
                        }
                        className="sr-only"
                      />
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                            formData.healthCheck.type === type.value
                              ? 'border-brand-500 bg-brand-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {formData.healthCheck.type === type.value && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-white capitalize">
                            {type.label}
                          </h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formData.healthCheck.type !== 'none' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Interval (ms)
                    </label>
                    <input
                      type="number"
                      value={formData.healthCheck.intervalMs}
                      onChange={(e) =>
                        updateNestedField(
                          'healthCheck',
                          'intervalMs',
                          parseInt(e.target.value) || 30000
                        )
                      }
                      min="1000"
                      max="300000"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Timeout (ms)
                    </label>
                    <input
                      type="number"
                      value={formData.healthCheck.timeoutMs}
                      onChange={(e) =>
                        updateNestedField(
                          'healthCheck',
                          'timeoutMs',
                          parseInt(e.target.value) || 5000
                        )
                      }
                      min="500"
                      max="60000"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Failure Threshold
                    </label>
                    <input
                      type="number"
                      value={formData.healthCheck.failureThreshold}
                      onChange={(e) =>
                        updateNestedField(
                          'healthCheck',
                          'failureThreshold',
                          parseInt(e.target.value) || 3
                        )
                      }
                      min="1"
                      max="10"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {formData.healthCheck.type === 'http' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    HTTP Path
                  </label>
                  <input
                    type="text"
                    value={formData.healthCheck.path || '/health'}
                    onChange={(e) => updateNestedField('healthCheck', 'path', e.target.value)}
                    className="w-full md:w-64 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="/health"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Path to check (e.g., /health, /api/status)
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-step="6">
              <p className="text-sm text-slate-600 dark:text-slate-400">{steps[5].description}</p>

              {formData.warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                    ⚠ Configuration Warnings
                  </h4>
                  <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
                    {formData.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span>•</span>
                        <span>
                          [{w.field}] {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Name:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white">
                      {formData.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Runtime:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white">
                      {formData.runtimePreset}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Executable:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white font-mono">
                      {formData.executable}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Working Dir:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white truncate">
                      {formData.workingDirectory}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Port:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white">
                      {formData.port}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Protocol:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white">
                      {formData.protocol}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Mode:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white capitalize">
                      {formData.lifecycleMode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Health Check:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white capitalize">
                      {formData.healthCheck.type}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {step < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext()}
                className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !canGoNext()}
                className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Registering...
                  </>
                ) : (
                  'Register'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
