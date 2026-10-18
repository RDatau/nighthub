import React from 'react';

export const SubtitleItem = React.memo(({ 
  sub, 
  isActive, 
  isEditing, 
  onEdit, 
  formatTime 
}: { 
  sub: any, 
  isActive: boolean, 
  isEditing: boolean, 
  onEdit: (id: string, text: string, start: number) => void,
  formatTime: (secs: number) => string
}) => {
  let subClass = 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5';
  if (isEditing) {
    subClass = 'bg-orange-500/20 dark:bg-amber-500/20 border-orange-500/50 dark:border-amber-500/50';
  } else if (isActive) {
    subClass = 'bg-black/5 dark:bg-white/5 border-orange-500/50 dark:border-amber-500/50';
  }

  return (
    <div 
      data-id={sub.id}
      onClick={() => onEdit(sub.id, sub.text, sub.start)}
      className={`p-3 mb-1 rounded-lg cursor-pointer border transition-all flex flex-col gap-1 ${subClass}`}
    >
      <div className="flex justify-between items-center">
        <span className={`text-xs font-mono ${isActive || isEditing ? 'text-orange-600 dark:text-amber-500' : 'text-orange-600/60 dark:text-amber-500/60'}`}>
          {formatTime(sub.start)} - {formatTime(sub.end)}
        </span>
      </div>
      <p className={`text-sm whitespace-pre-wrap ${isActive || isEditing ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
        {sub.text}
      </p>
    </div>
  );
});
