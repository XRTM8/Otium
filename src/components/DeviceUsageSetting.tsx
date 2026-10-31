import { useState } from 'react';
import { saveDeviceUsage, useDeviceUsage, type DeviceUsage } from '../platform/deviceUsage';
export function DeviceUsageSetting({ ar }: { ar: boolean }) {
  const { usage } = useDeviceUsage();
  const [error, setError] = useState(false);
  return <div className="rounded-2xl border border-line-subtle bg-hover-subtle p-3 space-y-2">
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold">{ar ? 'استخدام هذا الجهاز' : 'Use this device as'}</span>
      <select aria-label={ar ? 'استخدام هذا الجهاز' : 'Use this device as'} value={usage} className="min-h-12 rounded-xl bg-surface border border-line p-2 text-xs" onChange={event => setError(!saveDeviceUsage(event.target.value as DeviceUsage))}>
        <option value="auto">{ar ? 'تلقائي' : 'Automatic'}</option>
        <option value="handheld">{ar ? 'هاتف للدراسة والتحكم' : 'Personal reader / controller'}</option>
        <option value="display">{ar ? 'شاشة عرض أو تلفاز' : 'Display / television'}</option>
        <option value="board">{ar ? 'سبورة تفاعلية' : 'Interactive whiteboard'}</option>
      </select>
    </label>
    <p className="text-[11px] text-ink-muted">{ar ? 'اختيار محفوظ لهذا الجهاز. فعّل السبورة أدناه لإظهار أدواتها. تغيير الدور لا يغلق الملف أو الربط.' : 'Saved on this device. Enable the whiteboard below to show its tools. Changing role keeps your document and connection.'}</p>
    {error && <p role="alert" className="text-xs text-danger-ink">{ar ? 'تعذر حفظ الاختيار. تحقق من إتاحة تخزين الموقع.' : 'Could not save the choice. Check site storage access.'}</p>}
  </div>;
}
