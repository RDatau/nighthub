import React from 'react';

export const OSD = ({ visible, message }: { visible: boolean, message: string }) => {
  return (
    <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white/80 dark:bg-black/60 text-zinc-900 dark:text-white px-8 py-4 rounded-3xl text-3xl font-bold tracking-widest backdrop-blur-md pointer-events-none transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {message}
    </div>
  );
};
