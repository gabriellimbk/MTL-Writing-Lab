import { Languages } from 'lucide-react';

export type FeedbackLanguage = 'english' | 'bahasa';

export default function FeedbackLanguageToggle({ value, onChange }: { value: FeedbackLanguage; onChange: (language: FeedbackLanguage) => void }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="flex items-center gap-2 pl-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
        <Languages className="h-4 w-4 text-brand-500" />
        Feedback Language
      </div>
      <div className="flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Feedback language">
        {([
          ['english', 'English'],
          ['bahasa', 'Bahasa Melayu']
        ] as const).map(([language, label]) => (
          <button
            key={language}
            type="button"
            aria-pressed={value === language}
            onClick={() => onChange(language)}
            className={`rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
              value === language
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-500 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
