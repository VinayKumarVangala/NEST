'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@renderer/lib/utils';
import { Button } from './Button';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: string;
  title?: string;
}

export function QRCodeModal({ isOpen, onClose, data, title = 'QR Code' }: QRCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current && !qrGenerated) {
      generateQRCode(canvasRef.current, data);
      setQrGenerated(true);
    } else if (!isOpen) {
      setQrGenerated(false);
    }
  }, [isOpen, data, qrGenerated]);

  const generateQRCode = (canvas: HTMLCanvasElement, text: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 256;
    canvas.width = size;
    canvas.height = size;

    // Simple QR code generation using a basic approach
    // In production, you'd use a library like qrcode.react
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Draw a placeholder pattern (real implementation would use QR library)
    ctx.fillStyle = '#000000';
    const moduleSize = size / 25;
    
    // Finder patterns (top-left, top-right, bottom-left)
    drawFinderPattern(ctx, 0, 0, moduleSize);
    drawFinderPattern(ctx, size - 7 * moduleSize, 0, moduleSize);
    drawFinderPattern(ctx, 0, size - 7 * moduleSize, moduleSize);

    // Add text label
    ctx.fillStyle = '#666666';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR Code', size / 2, size - 10);
    ctx.fillText(text.substring(0, 40), size / 2, size + 10);
  };

  const drawFinderPattern = (ctx: CanvasRenderingContext2D, x: number, y: number, moduleSize: number) => {
    // Outer square (7x7)
    ctx.fillRect(x, y, 7 * moduleSize, 7 * moduleSize);
    // Inner white (5x5)
    ctx.clearRect(x + moduleSize, y + moduleSize, 5 * moduleSize, 5 * moduleSize);
    // Center black (3x3)
    ctx.fillRect(x + 2 * moduleSize, y + 2 * moduleSize, 3 * moduleSize, 3 * moduleSize);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex justify-center mb-4">
          <canvas ref={canvasRef} className="border border-slate-200 dark:border-slate-700 rounded-lg" />
        </div>
        
        <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-4 break-all">
          {data}
        </p>
        
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => downloadQR()}>
            Download
          </Button>
        </div>
      </div>
    </div>
  );

  function downloadQR() {
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement('a');
      link.download = 'qrcode.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }
}