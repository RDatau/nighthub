const fs = require('fs');

let content = fs.readFileSync('src/components/AILiveCompanionModal.tsx', 'utf8');

// Container
content = content.replace('bg-zinc-950/50 rounded-2xl border border-white/10', 'bg-white/70 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200/50 dark:border-white/10');
content = content.replace('text-white shrink-0 select-none', 'text-zinc-900 dark:text-white shrink-0 select-none');

// Header
content = content.replace('border-white/10 bg-zinc-950 backdrop-blur-xl shrink-0', 'border-zinc-200/50 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950 backdrop-blur-xl shrink-0');

// Input/Textarea
content = content.replace(/className="w-full bg-zinc-950 border border-amber-500\/60 rounded-xl p-2 text-xs text-white/g, 'className="w-full bg-white dark:bg-zinc-950 border border-amber-500/60 rounded-xl p-2 text-xs text-zinc-900 dark:text-white');
content = content.replace(/bg-zinc-900\/90 border border-zinc-800 rounded-2xl p-1\.5/g, 'bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-1.5');
content = content.replace(/bg-zinc-900\/90 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white/g, 'bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white');

// Background gradients
content = content.replace(/bg-gradient-to-b from-zinc-950\/95 via-zinc-900 to-zinc-950/g, 'bg-gradient-to-b from-zinc-50/95 via-zinc-100/80 to-zinc-100 dark:from-zinc-950/95 dark:via-zinc-900 dark:to-zinc-950');

// Banner
content = content.replace(/bg-zinc-900\/50 border-b border-white\/10 p-2/g, 'bg-zinc-100/50 dark:bg-zinc-900/50 border-b border-zinc-200/50 dark:border-white/10 p-2');

// Chat bubbles
content = content.replace(/bg-zinc-900\/95 border-l-2 border-l-amber-500 border border-zinc-800\/80 text-zinc-200/g, 'bg-white/95 dark:bg-zinc-900/95 border-l-2 border-l-amber-500 border border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-200');

// TTS Box
content = content.replace(/bg-zinc-950\/80 p-2\.5 rounded-xl border/g, 'bg-zinc-50/80 dark:bg-zinc-950/80 p-2.5 rounded-xl border');
content = content.replace(/bg-zinc-950\/80 border border-zinc-800/g, 'bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800');

// Bottom input dock
content = content.replace(/bg-zinc-950 border-t border-amber-500\/15/g, 'bg-zinc-50 dark:bg-zinc-950 border-t border-amber-500/15');

// Buttons / small boxes
content = content.replace(/bg-zinc-800\/60 px-1\.5 py-0\.5/g, 'bg-zinc-200/60 dark:bg-zinc-800/60 px-1.5 py-0.5');
content = content.replace(/hover:bg-zinc-800 hover:text-amber-300 text-zinc-400/g, 'hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-amber-500 dark:hover:text-amber-300 text-zinc-500 dark:text-zinc-400');
content = content.replace(/bg-zinc-800 hover:bg-zinc-700 text-zinc-300/g, 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300');
content = content.replace(/bg-zinc-900 text-zinc-400 hover:text-amber-400 border-zinc-800/g, 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 border-zinc-200 dark:border-zinc-800');
content = content.replace(/bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700/g, 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-700');
content = content.replace(/bg-zinc-800 text-zinc-500 border-zinc-700/g, 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700');

// Center bot icon
content = content.replace(/bg-zinc-950 rounded-2xl flex items-center justify-center text-amber-400/g, 'bg-white dark:bg-zinc-950 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-400');


fs.writeFileSync('src/components/AILiveCompanionModal.tsx', content);
