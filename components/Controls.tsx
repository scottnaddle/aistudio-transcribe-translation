
import React from 'react';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
];

interface ControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  targetLanguage: string;
  onLanguageChange: (language: string) => void;
}

const Controls: React.FC<ControlsProps> = ({
  isRecording,
  onToggleRecording,
  targetLanguage,
  onLanguageChange,
}) => {
  return (
    <div className="w-full bg-gray-800 p-4 shadow-lg flex items-center justify-center gap-4 md:gap-8 flex-wrap">
      <button
        onClick={onToggleRecording}
        className={`px-8 py-3 text-lg font-semibold rounded-full transition-all duration-300 ease-in-out flex items-center gap-2 ${
          isRecording
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-cyan-500 hover:bg-cyan-600 text-white'
        }`}
      >
        {isRecording ? (
          <>
            <StopIcon /> Stop Transcription
          </>
        ) : (
          <>
            <MicIcon /> Start Transcription
          </>
        )}
      </button>

      <div className="flex items-center gap-2">
        <label htmlFor="language-select" className="font-medium text-gray-300">
          Translate to:
        </label>
        <select
          id="language-select"
          value={targetLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={isRecording}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 p-2.5 disabled:opacity-50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.name}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 6h12v12H6z" />
    </svg>
);

export default Controls;
