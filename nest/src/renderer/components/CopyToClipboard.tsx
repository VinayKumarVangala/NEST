import { ReactNode, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyToClipboardProps {
  text: string;
  label?: string;
  showToast?: boolean;
  children: ReactNode;
}

export function CopyToClipboard({
  text,
  label = 'Copied!',
  showToast = false,
  children,
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <span onClick={handleClick} className="inline-block">
      {copied ? (
        <span
          className="flex items-center gap-1 text-green-600 dark:text-green-400"
          aria-live="polite"
        >
          <Check className="w-4 h-4" />
          {label}
        </span>
      ) : (
        children
      )}
    </span>
  );
}
