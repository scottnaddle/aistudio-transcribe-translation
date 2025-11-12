
import React, { useRef, useEffect } from 'react';
import { Segment } from '../types';

interface TextPanelProps {
  title: string;
  segments: Segment[];
}

const TextPanel: React.FC<TextPanelProps> = ({ title, segments }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  return (
    <div className="bg-gray-800 rounded-lg shadow-inner flex-1 flex flex-col w-full h-full p-1 md:p-2">
      <h2 className="text-xl font-bold text-center py-3 text-cyan-400 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
        {title}
      </h2>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
        {segments.map((segment, index) => (
          <p key={segment.id} className={`transition-opacity duration-500 ${segment.isFinal ? 'opacity-100' : 'opacity-50'}`}>
            <span className="mr-2">{segment.text}</span>
          </p>
        ))}
        {segments.length === 0 && (
            <p className="text-gray-500 text-center pt-8">Waiting for audio...</p>
        )}
      </div>
    </div>
  );
};

export default TextPanel;
