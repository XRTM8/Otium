import React from 'react';
import {
  BookOpen,
  Columns,
  LayoutTemplate,
  Moon,
  Palette,
  Sun,
} from 'lucide-react';
import { DeviceUsageSetting } from '../DeviceUsageSetting';
import type { ThemeMode, ViewMode } from '../../core/types';
import type { getTranslations } from '../../core/i18n/translations';
import type { ThemeScheduleMode } from '../../core/settings/preferences';

const THEME_DOT_COLORS: Record<ThemeMode, string> = {
  paper: '#d4c5a9',
  midnight: '#38bdf8',
  amoled: '#10b981',
  forest: '#34d399',
  nordic: '#60a5fa',
  parchment: '#d97706',
  amber: '#f59e0b',
  eink: '#9ca3af',
  pure: '#f8fafc',
  sakura: '#f472b6',
};

const ALL_THEMES: ThemeMode[] = [
  'paper',
  'amber',
  'amoled',
  'eink',
  'midnight',
  'pure',
  'parchment',
  'sakura',
  'forest',
  'nordic',
];

const QUICK_THEMES: ThemeMode[] = [
  'paper',
  'midnight',
  'amoled',
  'forest',
  'nordic',
  'parchment',
  'amber',
  'eink',
  'pure',
  'sakura',
];

interface ReadingSwitchRowProps {
  checked: boolean;
  title: string;
  description: string;
  onToggle: () => void;
  pointerCursor?: boolean;
}

const ReadingSwitchRow: React.FC<ReadingSwitchRowProps> = ({
  checked,
  title,
  description,
  onToggle,
  pointerCursor = false,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className={`flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover ${
      pointerCursor ? 'cursor-pointer' : ''
    }`}
  >
    <div className="min-w-0 flex-1">
      <div className="text-xs font-semibold text-ink">{title}</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">{description}</p>
    </div>
    <span
      aria-hidden="true"
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? 'border-accent/50 bg-accent' : 'border-line-strong bg-hover-strong'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'start-6' : 'start-0.5'
        }`}
      />
    </span>
  </button>
);

export const ReadingTabPanel: React.FC<{
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  mobile: boolean;
  mobileNavVisible: boolean;
  onMobileNavVisibleChange?: (visible: boolean) => void;
  smartBoardEnabled: boolean;
  onSmartBoardEnabledChange?: (enabled: boolean) => void;
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  themeSchedule: ThemeScheduleMode;
  onThemeScheduleChange?: (mode: ThemeScheduleMode) => void;
  dayTheme: ThemeMode;
  onDayThemeChange?: (theme: ThemeMode) => void;
  nightTheme: ThemeMode;
  onNightThemeChange?: (theme: ThemeMode) => void;
  keepScreenAwake: boolean;
  onKeepScreenAwakeChange?: (enabled: boolean) => void;
  rememberDocTheme: boolean;
  onRememberDocThemeChange?: (enabled: boolean) => void;
}> = ({
  ar,
  t,
  viewMode,
  onViewModeChange,
  mobile,
  mobileNavVisible,
  onMobileNavVisibleChange,
  smartBoardEnabled,
  onSmartBoardEnabledChange,
  theme,
  onThemeChange,
  themeSchedule,
  onThemeScheduleChange,
  dayTheme,
  onDayThemeChange,
  nightTheme,
  onNightThemeChange,
  keepScreenAwake,
  onKeepScreenAwakeChange,
  rememberDocTheme,
  onRememberDocThemeChange,
}) => (
  <div className="space-y-4 animate-in fade-in-50 duration-150">
    <div className="space-y-2">
      <label className="text-xs font-semibold text-ink-muted block">{t.defaultReadingMode}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={() => onViewModeChange('continuous')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'continuous'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <LayoutTemplate className="w-5 h-5" />
          <span className="font-medium">{ar ? 'التمرير المستمر' : 'Continuous'}</span>
          <span className="text-[10px] text-ink-faint">{ar ? 'تصفح عمودي سلس' : 'Smooth vertical flow'}</span>
        </button>

        <button
          onClick={() => onViewModeChange('dual')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'dual'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="font-medium">{ar ? 'صفحتين متجاورة' : 'Two pages'}</span>
        </button>

        <button
          onClick={() => onViewModeChange('single')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'single'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <Columns className="w-5 h-5" />
          <span className="font-medium">{ar ? 'صفحة واحدة' : 'Single page'}</span>
          <span className="text-[10px] text-ink-faint">{ar ? 'تركيز عالي' : 'Focused reading'}</span>
        </button>
      </div>
    </div>

    {mobile && onMobileNavVisibleChange && (
      <ReadingSwitchRow
        checked={mobileNavVisible}
        title={ar ? 'شريط التنقل السفلي' : 'Bottom navigation bar'}
        description={
          ar
            ? 'أرقام الصفحات والأزرار السريعة أسفل الشاشة. أخفِه لتبقى الصفحة نظيفة؛ تبقى لوحة الصفحات في قائمة الأدوات.'
            : 'Page numbers and quick actions at the bottom. Hide it for a bare page; the pages panel stays in the tools menu.'
        }
        onToggle={() => onMobileNavVisibleChange(!mobileNavVisible)}
      />
    )}

    <DeviceUsageSetting ar={ar} />
    {onSmartBoardEnabledChange && (
      <ReadingSwitchRow
        checked={smartBoardEnabled}
        title={ar ? 'السبورة الذكية' : 'Smart whiteboard'}
        description={
          ar
            ? 'إظهار السبورة والتقسيم على هذا الجهاز، بما فيه Android. يبقى اختيارك محفوظاً.'
            : 'Enable the whiteboard and split workspace on this device, including Android. Your choice is saved.'
        }
        onToggle={() => onSmartBoardEnabledChange(!smartBoardEnabled)}
      />
    )}

    {/* Visual Comfort & Theme Intelligence */}
    <div className="space-y-3 pt-3 border-t border-line-subtle">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-accent" />
        <span className="text-xs font-bold text-ink">
          {ar ? 'الراحة البصرية وبيئة القراءة' : 'Visual Comfort & Reading Environment'}
        </span>
      </div>

      {/* Theme Scheduling Mode */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-ink-muted">
          {ar ? 'جدولة الثيم الذكية' : 'Theme Schedule'}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'manual' as const, label: ar ? 'يدوي' : 'Manual', desc: ar ? 'اختيارك الثابت' : 'Fixed choice' },
            { id: 'system' as const, label: ar ? 'مزامنة النظام' : 'Follow System', desc: ar ? 'تلقائي مع جهازك' : 'With device OS' },
            { id: 'sunset' as const, label: ar ? 'حماية الغروب' : 'Sunset Shield', desc: ar ? 'ليلي في المساء' : 'Night at sunset' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onThemeScheduleChange?.(item.id)}
              className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                themeSchedule === item.id
                  ? 'bg-accent/15 border-accent/50 text-accent font-semibold'
                  : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
              }`}
            >
              <span className="text-xs">{item.label}</span>
              <span className="text-[9px] text-ink-faint mt-0.5">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Theme Selector (when Manual) */}
      {theme && onThemeChange && themeSchedule === 'manual' && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-ink-muted">
            {ar ? 'الثيم النشط الحالي' : 'Active Theme'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {QUICK_THEMES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onThemeChange(id)}
                className={`p-2 rounded-xl border flex items-center gap-2 text-start transition-all cursor-pointer ${
                  theme === id
                    ? 'bg-accent/15 border-accent/50 text-accent font-semibold'
                    : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-black/20"
                  style={{ backgroundColor: THEME_DOT_COLORS[id] }}
                />
                <span className="text-[11px] truncate">{t.themes[id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day / Night Theme Selection when scheduled */}
      {themeSchedule && themeSchedule !== 'manual' && (
        <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-hover-subtle border border-line-subtle text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-medium">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{ar ? 'الثيم النهاري' : 'Day Theme'}</span>
            </div>
            <select
              value={dayTheme || 'paper'}
              onChange={(e) => onDayThemeChange?.(e.target.value as ThemeMode)}
              className="w-full py-1.5 px-2 rounded-lg bg-surface border border-line text-ink text-xs focus:outline-none focus:border-accent cursor-pointer"
            >
              {ALL_THEMES.map((id) => (
                <option key={id} value={id}>
                  {t.themes[id]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-medium">
              <Moon className="w-3.5 h-3.5 text-accent" />
              <span>{ar ? 'الثيم الليلي' : 'Night Theme'}</span>
            </div>
            <select
              value={nightTheme || 'amoled'}
              onChange={(e) => onNightThemeChange?.(e.target.value as ThemeMode)}
              className="w-full py-1.5 px-2 rounded-lg bg-surface border border-line text-ink text-xs focus:outline-none focus:border-accent cursor-pointer"
            >
              {ALL_THEMES.map((id) => (
                <option key={id} value={id}>
                  {t.themes[id]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {onKeepScreenAwakeChange && (
        <ReadingSwitchRow
          checked={keepScreenAwake}
          title={ar ? 'إبقاء الشاشة مضاءة أثناء القراءة' : 'Keep Screen Awake While Reading'}
          description={
            ar
              ? 'تبقى الشاشة مضاءة حتى تغلق الكتاب.'
              : 'Keeps the screen on until you close the book.'
          }
          onToggle={() => onKeepScreenAwakeChange(!keepScreenAwake)}
          pointerCursor
        />
      )}

      {onRememberDocThemeChange && (
        <ReadingSwitchRow
          checked={rememberDocTheme}
          title={ar ? 'تذكر بيئة القراءة لكل كتاب' : 'Remember Theme Per Book'}
          description={
            ar
              ? 'يفتح كل كتاب بالثيم الذي اخترته له.'
              : 'Reopens each book with its saved theme.'
          }
          onToggle={() => onRememberDocThemeChange(!rememberDocTheme)}
          pointerCursor
        />
      )}
    </div>

  </div>
);
