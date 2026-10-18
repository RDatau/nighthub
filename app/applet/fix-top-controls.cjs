import fs from 'fs';

const file = 'src/components/TopControls.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace className="w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20 with className="bg-[var(--panel-bg)] w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20
content = content.replace(/className="w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500\/20/g, 'className="bg-[var(--panel-bg)] w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20');

// Replace className="absolute top-4 sm:top-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-5xl p-2 sm:p-4 border border-black/10 with className="bg-[var(--panel-bg)] absolute top-4 sm:top-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-5xl p-2 sm:p-4 border border-black/10
content = content.replace(/className="absolute top-4 sm:top-6 left-1\/2 transform -translate-x-1\/2 w-\[95%\] max-w-5xl p-2 sm:p-4 border border-black\/10/g, 'className="bg-[var(--panel-bg)] absolute top-4 sm:top-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-5xl p-2 sm:p-4 border border-black/10');

// Replace : 'hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]'
// with : 'bg-[var(--panel-bg)] hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]'
content = content.replace(/: 'hover:bg-orange-500\/20 dark:hover:bg-amber-500\/20 text-zinc-700 dark:text-zinc-300/g, ': \'bg-[var(--panel-bg)] hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300');

fs.writeFileSync(file, content);
console.log('Fixed TopControls.tsx');
