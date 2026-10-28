/**
 * Enterprise Barcode & QR Code Intelligence Engine.
 * Extracts payment links, tracking numbers, and invoice identifiers
 * using hardware-accelerated BarcodeDetector on Android.
 */

export interface DetectedBarcode {
  rawValue: string;
  format: string;
}

export async function detectBarcodesFromCanvas(canvas: HTMLCanvasElement): Promise<DetectedBarcode[]> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return [];
  }

  try {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    const supportedFormats: string[] = await BarcodeDetectorClass.getSupportedFormats().catch(() => [
      'qr_code',
      'code_128',
      'code_39',
      'ean_13',
    ]);

    const detector = new BarcodeDetectorClass({ formats: supportedFormats });
    const results = await detector.detect(canvas);

    return results.map((r: any) => ({
      rawValue: r.rawValue,
      format: r.format,
    }));
  } catch (err) {
    console.debug('Barcode detection skipped or unsupported:', err);
    return [];
  }
}
