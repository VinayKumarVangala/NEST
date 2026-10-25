import { useState } from 'react';
import { nest } from '@renderer/lib/ipc';
import { Folder, X } from 'lucide-react';

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  label?: string;
}

export function FolderPicker({ value, onChange, label = 'Project folder' }: FolderPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    setError(null);
    try {
      const result = await nest.apps.pickFolder();
      if (result.ok && result.data && result.data.path) {
        onChange(result.data.path);
      } else if (!result.ok) {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pick folder');
    }
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <div
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white min-h-[42px] flex items-center"
          onClick={() => setIsOpen(true)}
        >
          {value ? (
            <>
              <Folder className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
              <span className="truncate block">{value}</span>
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Click to select folder...</span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Browse"
          >
            <Folder className="w-5 h-5" />
          </button>
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-600"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {isOpen && (
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} aria-hidden="true" />
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
