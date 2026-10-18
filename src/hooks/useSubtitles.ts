
import { useState, useCallback, useRef } from 'react';

export interface SubtitleLine {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface SubSettings {
  size: number;
  color: string;
  bg: string;
  offset?: number;
  bgType?: 'box' | 'line';
  lineHeight?: number;
  fontFamily?: string;
  bgOpacity?: number;
}

export const useSubtitles = () => {
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subBrowserData, setSubBrowserData] = useState<SubtitleLine[]>([]);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [subOffset, setSubOffset] = useState(0); // In seconds
  const [subSettings, setSubSettings] = useState<SubSettings>({ size: 24, color: '#ffffff', bg: 'rgba(0,0,0,0.5)' });
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState('');

  const convertSrtToVtt = useCallback((srtText: string) => {
    let vtt = 'WEBVTT\n\n';
    const lines = srtText.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+$/)) continue; // Skip numbers
      if (line.match(/^\d{2}:\d{2}:\d{2}/)) {
        vtt += line.replace(/,/g, '.') + '\n';
      } else {
        // Strip basic HTML tags that VTT might not like or SRT uses
        const cleanLine = line.replace(/\{[^}]+\}/g, ''); // Strip {b}, {i}, etc.
        vtt += cleanLine + '\n';
      }
    }
    return vtt;
  }, []);

  const convertAssToVtt = useCallback((assText: string) => {
    let vtt = 'WEBVTT\n\n';
    const lines = assText.replace(/\r\n/g, '\n').split('\n');
    let eventsSection = false;
    
    for (const line of lines) {
      if (line.startsWith('[Events]')) {
        eventsSection = true;
        continue;
      }
      if (eventsSection && line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        if (parts.length >= 10) {
          const start = parts[1].trim();
          const end = parts[2].trim();
          let text = parts.slice(9).join(',').trim();
          
          // Strip ASS tags like {\pos(x,y)}, {\be1}, etc.
          text = text.replace(/\{[^}]+\}/g, '');
          // Replace \N with newline
          text = text.replace(/\\N/g, '\n');
          
          vtt += `${start}0 --> ${end}0\n`; // ASS is H:MM:SS.cc, VTT needs H:MM:SS.mmm
          vtt += `${text}\n\n`;
        }
      }
    }
    return vtt;
  }, []);

  const timeToSeconds = useCallback((timeStr: string) => {
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs += parseInt(parts[0], 10) * 3600;
      secs += parseInt(parts[1], 10) * 60;
      secs += parseFloat(parts[2].replace(',', '.'));
    } else if (parts.length === 2) {
      secs += parseInt(parts[0], 10) * 60;
      secs += parseFloat(parts[1].replace(',', '.'));
    }
    return secs;
  }, []);

  const parseVttForBrowser = useCallback((vttText: string) => {
    const parsedSubs: SubtitleLine[] = [];
    const blocks = vttText.replace(/\r\n/g, '\n').split(/\n{2,}/);
    
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timeLineIdx = lines.findIndex(l => l.includes('-->'));
      
      if (timeLineIdx !== -1) {
        const [startStr, endStr] = lines[timeLineIdx].split('-->').map(s => s.trim());
        const text = lines.slice(timeLineIdx + 1).join('\n').trim();
        parsedSubs.push({
          id: Math.random().toString(36).substr(2, 9),
          start: timeToSeconds(startStr),
          end: timeToSeconds(endStr),
          text
        });
      }
    }
    
    parsedSubs.sort((a, b) => a.start - b.start);
    setSubBrowserData(parsedSubs);
  }, [timeToSeconds]);

  const generateVttFromBrowserData = useCallback((offset: number = 0, customData?: SubtitleLine[]) => {
    const formatTimeVtt = (secs: number) => {
      const h = Math.floor(secs / 3600).toString().padStart(2, '0');
      const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
      const s = (secs % 60).toFixed(3).padStart(6, '0');
      return `${h}:${m}:${s}`;
    };

    let vtt = 'WEBVTT\n\n';
    const dataToUse = customData || subBrowserData;
    dataToUse.forEach((sub, index) => {
      const start = Math.max(0, sub.start + offset);
      const end = Math.max(0, sub.end + offset);
      vtt += `${index + 1}\n`;
      vtt += `${formatTimeVtt(start)} --> ${formatTimeVtt(end)}\n`;
      vtt += `${sub.text}\n\n`;
    });
    return vtt;
  }, [subBrowserData]);

  const loadSubtitle = useCallback(async (file: File) => {
    const text = await file.text();
    let vttText = text;
    
    if (file.name.endsWith('.srt')) {
      vttText = convertSrtToVtt(text);
    } else if (file.name.endsWith('.ass') || file.name.endsWith('.ssa')) {
      vttText = convertAssToVtt(text);
    }
    
    const blob = new Blob([vttText], { type: 'text/vtt' });
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
    setSubtitleUrl(URL.createObjectURL(blob));
    parseVttForBrowser(vttText);
    setSubOffset(0);
  }, [subtitleUrl, convertSrtToVtt, convertAssToVtt, parseVttForBrowser]);

  const updateSubtitleWithOffset = useCallback((offset: number) => {
    setSubOffset(offset);
    const newVtt = generateVttFromBrowserData(offset);
    const blob = new Blob([newVtt], { type: 'text/vtt' });
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
    setSubtitleUrl(URL.createObjectURL(blob));
  }, [subtitleUrl, generateVttFromBrowserData]);

  return {
    subtitleUrl, setSubtitleUrl,
    subBrowserData, setSubBrowserData,
    activeSubId, setActiveSubId,
    subOffset, setSubOffset, updateSubtitleWithOffset,
    subSettings, setSubSettings,
    editingSubId, setEditingSubId,
    editingSubText, setEditingSubText,
    loadSubtitle, generateVttFromBrowserData,
    convertSrtToVtt, convertAssToVtt, parseVttForBrowser
  };
};
