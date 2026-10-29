import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeViewProps {
  value: string;
  size?: number;
}

/**
 * Generates an authentic, standards-compliant SVG QR Code.
 * Scannable by any smartphone camera (iPhone, Samsung, Google Lens) or web scanner.
 */
export const QrCodeView: React.FC<QrCodeViewProps> = ({ value, size = 180 }) => {
  const [svgString, setSvgString] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((svg) => {
        if (active) setSvgString(svg);
      })
      .catch((err) => {
        console.error('Failed to generate QR Code SVG:', err);
      });

    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="p-2.5 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center justify-center select-none overflow-hidden"
    >
      {svgString ? (
        <div
          dangerouslySetInnerHTML={{ __html: svgString }}
          className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
        />
      ) : (
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      )}
    </div>
  );
};
