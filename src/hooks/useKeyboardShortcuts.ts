import { useEffect } from 'react';
import { matchesCommand, subscribeShortcuts } from '../services/shortcutManager';

export interface ShortcutHandlers {
  onTogglePlay: () => void;
  onSeekForward: (amount: number) => void;
  onSeekBackward: (amount: number) => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTogglePlaylist: () => void;
  onAddMarker: () => void;
  onCaptureScreenshot: () => void;
  onToggleAudioNormalize: () => void;
  onCycleRotate: () => void;
  onToggleRecording: () => void;
  onToggleTrim?: () => void;
  onStepFrameBackward?: () => void;
  onStepFrameForward?: () => void;

  // Extended controls
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
  onResetSpeed?: () => void;
  onTogglePiP?: () => void;
  onCycleAspectRatio?: () => void;
  onToggleFlipHorizontal?: () => void;
  onToggleEnhance?: () => void;
  onToggleSuperRes?: () => void;
  onToggleAmbientMode?: () => void;
  onToggleFrameInterpolation?: () => void;
  onToggleShuffle?: () => void;
  onCycleRepeatMode?: () => void;
  onClearPlaylist?: () => void;
  onOpenMediaFile?: () => void;
  onOpenNetworkStream?: () => void;
  onOpenSubtitleFile?: () => void;
  onOpenWebSniffer?: () => void;
  onOpenSettings?: () => void;
  onOpenShortcutsSheet?: () => void;
  onOpenMemoryManager?: () => void;
  onOpenAudioSettings?: () => void;
  onOpenSubSettings?: () => void;
  onOpenSubBrowser?: () => void;
  onMinimizeToHome?: () => void;
  onToggleAlwaysOnTop?: () => void;
  onCycleAudioTrack?: () => void;
  onToggleSwapChannels?: () => void;
  onToggleMonoDownmix?: () => void;
  onAudioDelayPlus?: () => void;
  onAudioDelayMinus?: () => void;
  onResetAudioDelay?: () => void;
  onAudioBoostPlus?: () => void;
  onAudioBoostMinus?: () => void;
  onToggleSubtitles?: () => void;
  onCycleSubtitleTrack?: () => void;
  onSubDelayPlus?: () => void;
  onSubDelayMinus?: () => void;
  onResetSubDelay?: () => void;
  onSubSizeIncrease?: () => void;
  onSubSizeDecrease?: () => void;
  onSaveCurrentLoop?: () => void;
  onToggleLoopList?: () => void;
  onToggleMarkerList?: () => void;
  onNextMarker?: () => void;
  onPrevMarker?: () => void;
  onMakeThumbnail?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers, active: boolean = true) => {
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 1. Frame Navigation & Seeks
      if (matchesCommand(e, 'toggleTrim')) {
        e.preventDefault();
        handlers.onToggleTrim?.();
        return;
      }
      if (matchesCommand(e, 'stepFrameBackward')) {
        e.preventDefault();
        handlers.onStepFrameBackward?.();
        return;
      }
      if (matchesCommand(e, 'stepFrameForward')) {
        e.preventDefault();
        handlers.onStepFrameForward?.();
        return;
      }
      if (matchesCommand(e, 'seekForward60')) {
        e.preventDefault();
        handlers.onSeekForward(60);
        return;
      }
      if (matchesCommand(e, 'seekBackward60')) {
        e.preventDefault();
        handlers.onSeekBackward(60);
        return;
      }
      if (matchesCommand(e, 'seekForward30')) {
        e.preventDefault();
        handlers.onSeekForward(30);
        return;
      }
      if (matchesCommand(e, 'seekBackward30')) {
        e.preventDefault();
        handlers.onSeekBackward(30);
        return;
      }
      if (matchesCommand(e, 'seekForward10')) {
        e.preventDefault();
        handlers.onSeekForward(10);
        return;
      }
      if (matchesCommand(e, 'seekBackward10')) {
        e.preventDefault();
        handlers.onSeekBackward(10);
        return;
      }
      if (matchesCommand(e, 'seekForward5')) {
        e.preventDefault();
        handlers.onSeekForward(5);
        return;
      }
      if (matchesCommand(e, 'seekBackward5')) {
        e.preventDefault();
        handlers.onSeekBackward(5);
        return;
      }

      // 2. Playback Speed & Controls
      if (matchesCommand(e, 'togglePlay')) {
        e.preventDefault();
        handlers.onTogglePlay();
        return;
      }
      if (matchesCommand(e, 'speedUp')) {
        e.preventDefault();
        handlers.onSpeedUp?.();
        return;
      }
      if (matchesCommand(e, 'speedDown')) {
        e.preventDefault();
        handlers.onSpeedDown?.();
        return;
      }
      if (matchesCommand(e, 'resetSpeed')) {
        e.preventDefault();
        handlers.onResetSpeed?.();
        return;
      }

      // 3. Audio & Volume
      if (matchesCommand(e, 'volumeUp')) {
        e.preventDefault();
        handlers.onVolumeUp();
        return;
      }
      if (matchesCommand(e, 'volumeDown')) {
        e.preventDefault();
        handlers.onVolumeDown();
        return;
      }
      if (matchesCommand(e, 'toggleMute')) {
        e.preventDefault();
        handlers.onToggleMute();
        return;
      }
      if (matchesCommand(e, 'toggleAudioNormalize')) {
        e.preventDefault();
        handlers.onToggleAudioNormalize();
        return;
      }
      if (matchesCommand(e, 'toggleSwapChannels')) {
        e.preventDefault();
        handlers.onToggleSwapChannels?.();
        return;
      }
      if (matchesCommand(e, 'toggleMonoDownmix')) {
        e.preventDefault();
        handlers.onToggleMonoDownmix?.();
        return;
      }
      if (matchesCommand(e, 'openAudioSettings')) {
        e.preventDefault();
        handlers.onOpenAudioSettings?.();
        return;
      }
      if (matchesCommand(e, 'cycleAudioTrack')) {
        e.preventDefault();
        handlers.onCycleAudioTrack?.();
        return;
      }
      if (matchesCommand(e, 'audioDelayPlus')) {
        e.preventDefault();
        handlers.onAudioDelayPlus?.();
        return;
      }
      if (matchesCommand(e, 'audioDelayMinus')) {
        e.preventDefault();
        handlers.onAudioDelayMinus?.();
        return;
      }
      if (matchesCommand(e, 'resetAudioDelay')) {
        e.preventDefault();
        handlers.onResetAudioDelay?.();
        return;
      }
      if (matchesCommand(e, 'audioBoostPlus')) {
        e.preventDefault();
        handlers.onAudioBoostPlus?.();
        return;
      }
      if (matchesCommand(e, 'audioBoostMinus')) {
        e.preventDefault();
        handlers.onAudioBoostMinus?.();
        return;
      }

      // 4. Subtitles
      if (matchesCommand(e, 'toggleSubtitles')) {
        e.preventDefault();
        handlers.onToggleSubtitles?.();
        return;
      }
      if (matchesCommand(e, 'cycleSubtitleTrack')) {
        e.preventDefault();
        handlers.onCycleSubtitleTrack?.();
        return;
      }
      if (matchesCommand(e, 'subDelayPlus')) {
        e.preventDefault();
        handlers.onSubDelayPlus?.();
        return;
      }
      if (matchesCommand(e, 'subDelayMinus')) {
        e.preventDefault();
        handlers.onSubDelayMinus?.();
        return;
      }
      if (matchesCommand(e, 'resetSubDelay')) {
        e.preventDefault();
        handlers.onResetSubDelay?.();
        return;
      }
      if (matchesCommand(e, 'subSizeIncrease')) {
        e.preventDefault();
        handlers.onSubSizeIncrease?.();
        return;
      }
      if (matchesCommand(e, 'subSizeDecrease')) {
        e.preventDefault();
        handlers.onSubSizeDecrease?.();
        return;
      }
      if (matchesCommand(e, 'openSubSettings')) {
        e.preventDefault();
        handlers.onOpenSubSettings?.();
        return;
      }
      if (matchesCommand(e, 'openSubBrowser')) {
        e.preventDefault();
        handlers.onOpenSubBrowser?.();
        return;
      }
      if (matchesCommand(e, 'openSubtitleFile')) {
        e.preventDefault();
        handlers.onOpenSubtitleFile?.();
        return;
      }

      // 5. Display & Visuals
      if (matchesCommand(e, 'toggleFullscreen')) {
        e.preventDefault();
        handlers.onToggleFullscreen();
        return;
      }
      if (matchesCommand(e, 'togglePiP')) {
        e.preventDefault();
        handlers.onTogglePiP?.();
        return;
      }
      if (matchesCommand(e, 'cycleRotate')) {
        e.preventDefault();
        handlers.onCycleRotate();
        return;
      }
      if (matchesCommand(e, 'cycleAspectRatio')) {
        e.preventDefault();
        handlers.onCycleAspectRatio?.();
        return;
      }
      if (matchesCommand(e, 'toggleFlipHorizontal')) {
        e.preventDefault();
        handlers.onToggleFlipHorizontal?.();
        return;
      }
      if (matchesCommand(e, 'toggleEnhance')) {
        e.preventDefault();
        handlers.onToggleEnhance?.();
        return;
      }
      if (matchesCommand(e, 'toggleSuperRes')) {
        e.preventDefault();
        handlers.onToggleSuperRes?.();
        return;
      }
      if (matchesCommand(e, 'toggleAmbientMode')) {
        e.preventDefault();
        handlers.onToggleAmbientMode?.();
        return;
      }
      if (matchesCommand(e, 'toggleFrameInterpolation')) {
        e.preventDefault();
        handlers.onToggleFrameInterpolation?.();
        return;
      }

      // 6. Playlist & Media
      if (matchesCommand(e, 'nextVideo')) {
        e.preventDefault();
        handlers.onNext();
        return;
      }
      if (matchesCommand(e, 'prevVideo')) {
        e.preventDefault();
        handlers.onPrev();
        return;
      }
      if (matchesCommand(e, 'togglePlaylist')) {
        e.preventDefault();
        handlers.onTogglePlaylist();
        return;
      }
      if (matchesCommand(e, 'toggleShuffle')) {
        e.preventDefault();
        handlers.onToggleShuffle?.();
        return;
      }
      if (matchesCommand(e, 'cycleRepeatMode')) {
        e.preventDefault();
        handlers.onCycleRepeatMode?.();
        return;
      }
      if (matchesCommand(e, 'openMediaFile')) {
        e.preventDefault();
        handlers.onOpenMediaFile?.();
        return;
      }
      if (matchesCommand(e, 'openNetworkStream')) {
        e.preventDefault();
        handlers.onOpenNetworkStream?.();
        return;
      }
      if (matchesCommand(e, 'clearPlaylist')) {
        e.preventDefault();
        handlers.onClearPlaylist?.();
        return;
      }

      // 7. Markers & A-B
      if (matchesCommand(e, 'addMarker')) {
        e.preventDefault();
        handlers.onAddMarker();
        return;
      }
      if (matchesCommand(e, 'toggleMarkerList')) {
        e.preventDefault();
        handlers.onToggleMarkerList?.();
        return;
      }
      if (matchesCommand(e, 'nextMarker')) {
        e.preventDefault();
        handlers.onNextMarker?.();
        return;
      }
      if (matchesCommand(e, 'prevMarker')) {
        e.preventDefault();
        handlers.onPrevMarker?.();
        return;
      }
      if (matchesCommand(e, 'saveCurrentLoop')) {
        e.preventDefault();
        handlers.onSaveCurrentLoop?.();
        return;
      }
      if (matchesCommand(e, 'toggleLoopList')) {
        e.preventDefault();
        handlers.onToggleLoopList?.();
        return;
      }

      // 8. Tools, Recording & Windows
      if (matchesCommand(e, 'openWebSniffer')) {
        e.preventDefault();
        handlers.onOpenWebSniffer?.();
        return;
      }
      if (matchesCommand(e, 'captureScreenshot')) {
        e.preventDefault();
        handlers.onCaptureScreenshot();
        return;
      }
      if (matchesCommand(e, 'makeThumbnail')) {
        e.preventDefault();
        handlers.onMakeThumbnail?.();
        return;
      }
      if (matchesCommand(e, 'toggleRecording')) {
        e.preventDefault();
        handlers.onToggleRecording();
        return;
      }
      if (matchesCommand(e, 'openSettings')) {
        e.preventDefault();
        handlers.onOpenSettings?.();
        return;
      }
      if (matchesCommand(e, 'openShortcutsSheet')) {
        e.preventDefault();
        handlers.onOpenShortcutsSheet?.();
        return;
      }
      if (matchesCommand(e, 'openMemoryManager')) {
        e.preventDefault();
        handlers.onOpenMemoryManager?.();
        return;
      }
      if (matchesCommand(e, 'minimizeToHome')) {
        e.preventDefault();
        handlers.onMinimizeToHome?.();
        return;
      }
      if (matchesCommand(e, 'toggleAlwaysOnTop')) {
        e.preventDefault();
        handlers.onToggleAlwaysOnTop?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handlers]);
};
