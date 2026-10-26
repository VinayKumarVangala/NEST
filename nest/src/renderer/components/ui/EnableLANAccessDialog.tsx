'use client';

import { useState, useCallback } from 'react';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, WorkflowStep, AccessWorkflowStatus } from '@shared/types';
import { Button } from './Button';
import { CopyButton } from './CopyButton';
import { QRCodeModal } from './QRCodeModal';
import { cn } from '@renderer/lib/utils';
import { useToast } from '@renderer/hooks/useToast';

interface EnableLANAccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  app: ApplicationConfig;
}

export function EnableLANAccessDialog({ isOpen, onClose, app }: EnableLANAccessDialogProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [workflow, setWorkflow] = useState<AccessWorkflowStatus | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [lanUrl, setLanUrl] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const stepLabels: Record<number, string> = {
    1: 'Preconditions',
    2: 'Binding Check',
    3: 'Change Plan',
    4: 'User Confirmation',
    5: 'Apply Changes',
    6: 'Local Verification',
    7: 'Remote Verification',
    8: 'Persist Policy',
    9: 'Disable/Rollback',
    10: 'Reconciliation',
  };

  const startWorkflow = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await nest.access.workflow.start(app.id);
      if (!result.ok) throw new Error(result.error.message);
      setWorkflow(result.data);
      await executeStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow');
      toast({ title: 'Error', message: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [app.id, toast]);

  const executeStep = useCallback(async (step: number, payload?: Record<string, unknown>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await nest.access.workflow.step(app.id, step, payload);
      if (!result.ok) throw new Error(result.error.message);
      
      const { step: stepResult, nextStep, workflow: wf } = result.data;
      setWorkflow(wf);
      setSteps((prev) => [...prev.filter(s => s.step !== stepResult.step), stepResult]);
      setCurrentStep(stepResult.step);
      
      if (nextStep) {
        // Auto-advance for non-interactive steps
        if (nextStep !== 4 && nextStep !== 7) {
          await executeStep(nextStep);
        } else {
          setCurrentStep(nextStep);
        }
      } else if (stepResult.step === 8 && stepResult.status === 'completed') {
        // After step 8, workflow is complete
        setCompleted(true);
        setLanUrl(buildLanUrl());
        toast({ title: 'Success', message: 'LAN access enabled successfully', variant: 'success' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Step ${step} failed`);
      toast({ title: `Step ${step} failed`, message: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [app.id, toast]);

  const handleStep4Confirm = useCallback(async () => {
    if (confirmationText !== 'I understand the risks') {
      setError('Please type "I understand the risks"');
      return;
    }
    if (!checkboxChecked) {
      setError('Please check the confirmation checkbox');
      return;
    }
    await executeStep(4, { confirmation: confirmationText, checkboxChecked: true });
  }, [confirmationText, checkboxChecked, executeStep]);

  const handleStep7Confirm = useCallback(async (confirmed: boolean) => {
    await executeStep(7, { confirmed });
  }, [executeStep]);

  const buildLanUrl = () => {
    // This would be built from network manager data
    return `${app.protocol}://[LAN-IP]:${app.port}`;
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Preconditions workflow={workflow} onStart={startWorkflow} isLoading={isLoading} error={error} app={app} />;
      case 2:
        return <Step2Binding workflow={workflow} isLoading={isLoading} error={error} />;
      case 3:
        return <Step3ChangePlan workflow={workflow} isLoading={isLoading} error={error} />;
      case 4:
        return <Step4Confirmation workflow={workflow} confirmationText={confirmationText} setConfirmationText={setConfirmationText} checkboxChecked={checkboxChecked} setCheckboxChecked={setCheckboxChecked} onConfirm={handleStep4Confirm} isLoading={isLoading} error={error} />;
      case 5:
        return <Step5Apply workflow={workflow} isLoading={isLoading} error={error} />;
      case 6:
        return <Step6LocalVerify workflow={workflow} isLoading={isLoading} error={error} />;
      case 7:
        return <Step7RemoteVerify workflow={workflow} onConfirm={handleStep7Confirm} isLoading={isLoading} error={error} lanUrl={lanUrl} showQR={showQR} setShowQR={setShowQR} />;
      case 8:
        return <Step8Persist workflow={workflow} isLoading={isLoading} error={error} onComplete={() => { setCompleted(true); setLanUrl(buildLanUrl()); }} />;
      default:
        return <div className="text-center py-8">Workflow complete</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Enable LAN Access</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            disabled={isLoading}
            aria-label="Close"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            {Object.entries(stepLabels).slice(0, 8).map(([num, label]) => {
              const stepNum = parseInt(num);
              const isActive = stepNum === currentStep;
              const isCompleted = steps.some(s => s.step === stepNum && s.status === 'completed');
              const hasError = steps.some(s => s.step === stepNum && s.status === 'failed');
              
              return (
                <div key={num} className="flex flex-col items-center relative">
                  {stepNum > 1 && (
                    <div className="absolute left-[-50%] top-3 w-full h-1 z-0 transition-colors" />
                  )}
                  <div
                    className={cn(
                      'relative z-10 flex items-center justify-center w-6 h-6 rounded-full font-medium text-sm transition-all',
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : hasError
                          ? 'bg-red-500 text-white'
                          : isActive
                            ? 'bg-brand-600 text-white ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-800'
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    )}
                  >
                    {isCompleted ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span className={cn('mt-1 text-xs text-center w-20', isActive ? 'font-medium text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400')}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-4">
          {renderStep()}
        </div>

        {/* Completed View */}
        {completed && lanUrl && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20">
            <h3 className="font-semibold text-green-800 dark:text-green-300 mb-3">LAN Access Enabled</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 flex-1 break-all">
                  {lanUrl}
                </span>
                <CopyButton text={lanUrl} onCopy={() => {}} label="Copy" size="sm" />
                <Button variant="outline" size="sm" onClick={() => setShowQR(true)}>QR Code</Button>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400">
                Test from a second device on the same network. The remote verification step will be marked complete once confirmed.
              </p>
            </div>
          </div>
        )}
      </div>

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        data={lanUrl}
        title={`${app.name} LAN Access`}
      />
    </div>
  );
}

// Step Components
function Step1Preconditions({ workflow, onStart, isLoading, error, app }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 1);
  const details = step?.details;
  
  if (!workflow) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600 dark:text-slate-400">
          This will guide you through enabling LAN access for <strong>{app.name}</strong>.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          The workflow will check preconditions, verify the application's binding, create a change plan,
          apply firewall rules, and verify connectivity.
        </p>
        <Button onClick={onStart} disabled={isLoading} className="w-full">
          Start Workflow
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      <div className="grid gap-3">
        {details && Object.entries(details).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            <span className={cn('font-medium', value === true ? 'text-green-600 dark:text-green-400' : value === false ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
              {value === true ? '✓' : value === false ? '✗' : String(value)}
            </span>
          </div>
        ))}
      </div>
      {!isLoading && step?.status !== 'completed' && (
        <Button onClick={onStart} className="w-full">Run Preconditions Check</Button>
      )}
    </div>
  );
}

function Step2Binding({ workflow, isLoading, error }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 2);
  const details = step?.details;
  const actionRequired = step?.actionRequired;
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {details && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Binding Class</span>
            <span className={cn('font-medium px-2 py-1 rounded', 
              details.bindingClass === 'loopback_only' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
              details.bindingClass === 'not_listening' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            )}>
              {details.bindingClass.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Listener Address</span>
            <span className="font-mono text-sm text-slate-900 dark:text-white">{details.listenerAddress || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">LAN Launch Profile</span>
            <span className={details.lanLaunchProfileAvailable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {details.lanLaunchProfileAvailable ? 'Available' : 'Not configured'}
            </span>
          </div>
        </div>
      )}
      {actionRequired === 'lanLaunchProfileRestart' && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-400 text-sm">
          Application is bound to loopback only. NEST will restart it with the LAN launch profile.
        </div>
      )}
      {actionRequired === 'manualConfig' && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-400 text-sm">
          External application bound to loopback. You must manually configure it to listen on 0.0.0.0 or LAN IP.
        </div>
      )}
    </div>
  );
}

function Step3ChangePlan({ workflow, isLoading, error }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 3);
  const details = step?.details;
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {details && (
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <h4 className="font-medium text-slate-900 dark:text-white mb-2">Proposed Firewall Rule</h4>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Name</span><span className="font-mono">{details.proposedFirewallRule?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Port</span><span>{details.proposedFirewallRule?.port}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Protocol</span><span>{details.proposedFirewallRule?.protocol}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Remote Address</span><span>{details.proposedFirewallRule?.remoteAddress}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Profile</span><span className="text-green-600 dark:text-green-400">{details.proposedFirewallRule?.profile}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Group</span><span>{details.proposedFirewallRule?.group}</span></div>
            </div>
          </div>
          {details.needsRestart && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-400 text-sm">
              Application restart required (binding is loopback_only)
            </div>
          )}
          {details.riskNotes?.length && (
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
              <h4 className="font-medium text-slate-900 dark:text-white mb-2">Risk Notes</h4>
              <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                {details.riskNotes.map((note: string, i: number) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step4Confirmation({ workflow, confirmationText, setConfirmationText, checkboxChecked, setCheckboxChecked, onConfirm, isLoading, error }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 4);
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
        <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">Confirmation Required</h4>
        <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
          Enabling LAN access will expose this application to other devices on your local network.
          Please confirm you understand the risks.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
              Type the confirmation text:
            </label>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder='Type "I understand the risks"'
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              disabled={isLoading}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => setCheckboxChecked(e.target.checked)}
              className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
              disabled={isLoading}
            />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              I understand that this will create a firewall rule allowing inbound connections
              from the local subnet on the Private network profile.
            </span>
          </label>
        </div>
      </div>
      <Button onClick={onConfirm} disabled={isLoading || confirmationText !== 'I understand the risks' || !checkboxChecked} className="w-full">
        Confirm & Continue
      </Button>
    </div>
  );
}

function Step5Apply({ workflow, isLoading, error }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 5);
  const details = step?.details;
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {details && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Restart Performed</span>
            <span className={details.restartPerformed ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
              {details.restartPerformed ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Firewall Rule Added</span>
            <span className={details.firewallRuleAdded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {details.firewallRuleAdded ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Read-back Verified</span>
            <span className={details.readbackVerified ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {details.readbackVerified ? 'Yes' : 'No'}
            </span>
          </div>
          {details.ruleName && (
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
              <span className="text-sm text-slate-600 dark:text-slate-400">Rule Name</span>
              <span className="font-mono text-sm text-slate-900 dark:text-white">{details.ruleName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step6LocalVerify({ workflow, isLoading, error }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 6);
  const details = step?.details;
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {details && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-400">Local Reachable</span>
            <span className={details.localReachable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {details.localReachable ? 'Yes' : 'No'}
            </span>
          </div>
          {details.latencyMs && (
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
              <span className="text-sm text-slate-600 dark:text-slate-400">Latency</span>
              <span className="font-mono text-sm text-slate-900 dark:text-white">{details.latencyMs}ms</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step7RemoteVerify({ workflow, onConfirm, isLoading, error, lanUrl, showQR, setShowQR }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 7);
  const details = step?.details;
  const confirmed = details?.confirmed;
  const verification = details?.verification;
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      
      <div className="p-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded">
        <h4 className="font-medium text-brand-800 dark:text-brand-300 mb-3">Remote Verification Required</h4>
        <p className="text-sm text-brand-700 dark:text-brand-400 mb-4">
          LAN connectivity can only be verified by a remote device. Please test from a second device
          on the same network.
        </p>
        
        {lanUrl && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 flex-1 break-all">
                {lanUrl}
              </span>
              <CopyButton text={lanUrl} onCopy={() => {}} label="Copy" size="sm" />
              <Button variant="outline" size="sm" onClick={() => setShowQR(true)}>QR Code</Button>
            </div>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button 
            variant={confirmed ? 'primary' : 'outline'} 
            onClick={() => onConfirm(true)} 
            disabled={isLoading || confirmed}
            className="flex-1"
          >
            {confirmed ? '✓ Confirmed' : 'I confirmed from a remote device'}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onConfirm(false)} 
            disabled={isLoading}
            className="flex-1"
          >
            Skip (mark as not verified)
          </Button>
        </div>
        
        {verification === 'remote_user_confirmed' && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-2">✓ Remote verification confirmed</p>
        )}
      </div>
    </div>
  );
}

function Step8Persist({ workflow, isLoading, error, onComplete }: any) {
  const step = workflow?.steps.find((s: any) => s.step === 8);
  
  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {step?.status === 'completed' ? (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
          <p className="text-green-800 dark:text-green-300 font-medium">Policy persisted successfully</p>
          <p className="text-sm text-green-700 dark:text-green-400 mt-1">LAN access is now enabled for this application.</p>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-600 dark:text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-3"></div>
          <p>Persisting policy...</p>
        </div>
      )}
    </div>
  );
}