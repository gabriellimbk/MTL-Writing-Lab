import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import FeedbackContent from './FeedbackContent';

type FeedbackAccordionItem = {
  title: string;
  content: any;
  icon: React.ReactNode;
  tone: 'mint' | 'peach' | 'lavender' | 'sky' | 'rose';
};

const tones: Record<FeedbackAccordionItem['tone'], { panel: string; icon: string }> = {
  mint: { panel: 'bg-green-50 border-green-200 text-green-800', icon: 'bg-green-100 text-green-700' },
  peach: { panel: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'bg-amber-100 text-amber-700' },
  lavender: { panel: 'bg-purple-50 border-purple-200 text-purple-900', icon: 'bg-purple-100 text-purple-700' },
  sky: { panel: 'bg-blue-50 border-blue-200 text-blue-800', icon: 'bg-blue-100 text-blue-700' },
  rose: { panel: 'bg-rose-50 border-rose-200 text-rose-900', icon: 'bg-rose-100 text-rose-700' }
};

export default function FeedbackAccordion({ items }: { items: FeedbackAccordionItem[] }) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.map(item => {
        const isOpen = openTitle === item.title;
        const tone = tones[item.tone];

        return (
          <section key={item.title} className={`overflow-hidden rounded-2xl border ${tone.panel}`}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenTitle(isOpen ? null : item.title)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/35"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
                {item.icon}
              </span>
              <span className="flex-1 text-[11px] font-black uppercase tracking-[0.14em]">{item.title}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="border-t border-current/10 px-5 pb-5 pt-4">
                <FeedbackContent content={item.content} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
