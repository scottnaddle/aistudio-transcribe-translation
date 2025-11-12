import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from "@google/genai";
import { Segment } from './types';
import { translateText } from './services/geminiService';
import ApiKeySelector from './components/ApiKeySelector';
import Controls from './components/Controls';
import TextPanel from './components/TextPanel';

// Define the Blob type locally to resolve the import error from '@google/genai'.
// The structure matches what the Gemini API expects for media blobs.
interface Blob {
  data: string;
  mimeType: string;
}

// Extend the Window interface to include webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// --- AudioWorklet Processor ---
// This code will be run in a separate thread to process audio.
// It now includes buffering to send larger, more efficient audio chunks.
const audioWorkletProcessor = `
  class AudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.bufferSize = options.processorOptions.bufferSize;
      this.buffer = new Float32Array(this.bufferSize);
      this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      if (input.length > 0) {
        const inputData = input[0]; // Float32Array
        
        // Append new data to our buffer
        for (let i = 0; i < inputData.length; i++) {
          this.buffer[this.bufferIndex++] = inputData[i];
          
          // When the buffer is full, send it to the main thread
          if (this.bufferIndex === this.bufferSize) {
            // Convert Float32Array to Int16Array
            const int16 = new Int16Array(this.bufferSize);
            for (let j = 0; j < this.bufferSize; j++) {
                int16[j] = this.buffer[j] < 0 ? this.buffer[j] * 32768 : this.buffer[j] * 32767;
            }
            this.port.postMessage(int16);
            
            // Reset buffer
            this.bufferIndex = 0;
          }
        }
      }
      return true; // Keep the processor alive
    }
  }

  registerProcessor('audio-processor', AudioProcessor);
`;


// Helper to encode raw audio data to base64
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const CONTEXT_WINDOW_SIZE = 5; // Number of recent segments to send for contextual translation
const TRANSLATION_DEBOUNCE_MS = 1500; // Wait 1.5s after speech stops to translate
const AUDIO_BUFFER_SIZE = 4096; // Buffer size for the audio worklet

const App: React.FC = () => {
    const [apiKeyReady, setApiKeyReady] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState('Spanish');
    const [transcriptionSegments, setTranscriptionSegments] = useState<Segment[]>([]);
    const [translationSegments, setTranslationSegments] = useState<Segment[]>([]);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const translationTimerRef = useRef<number | null>(null);
    const isInterruptedRef = useRef(false);

    // Refs for state management to avoid stale closures and optimize updates
    const transcriptionSegmentsRef = useRef(transcriptionSegments);
    transcriptionSegmentsRef.current = transcriptionSegments;
    const targetLanguageRef = useRef(targetLanguage);
    targetLanguageRef.current = targetLanguage;

    // Refs for performance optimization
    const latestTranscriptionTextRef = useRef('');
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const checkApiKey = async () => {
            if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setApiKeyReady(true);
            }
        };
        checkApiKey();
    }, []);
    
    const processTranslation = useCallback(async () => {
        const segmentsToTranslate = transcriptionSegmentsRef.current
            .slice(-CONTEXT_WINDOW_SIZE)
            .filter(s => s.isFinal);

        if (segmentsToTranslate.length === 0) return;

        const segmentTexts = segmentsToTranslate.map(s => s.text);
        const segmentIds = segmentsToTranslate.map(s => s.id);

        try {
            const translations = await translateText(segmentTexts, targetLanguageRef.current);
            
            if (translations.length > 0) {
                setTranslationSegments(prev => {
                    const newSegments = [...prev];
                    const idToIndexMap = new Map<string, number>();
                    newSegments.forEach((seg, index) => idToIndexMap.set(seg.id, index));

                    translations.forEach((translatedText, i) => {
                        const id = segmentIds[i];
                        const index = idToIndexMap.get(id);
                        if (index !== undefined) {
                            newSegments[index] = { ...newSegments[index], text: translatedText, isFinal: true };
                        }
                    });
                    return newSegments;
                });
            }
        } catch (error) {
            console.error("Translation failed:", error);
        }
    }, []);

    const establishLiveSession = useCallback(async () => {
        if (!process.env.API_KEY || !workletNodeRef.current) {
            console.error("Cannot establish session, missing prerequisites.");
            return;
        }

        console.log("Establishing new live session...");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                inputAudioTranscription: {},
                responseModalities: [Modality.AUDIO],
            },
            callbacks: {
                onopen: () => console.log('Live session opened.'),
                onclose: () => console.log('Live session closed.'),
                onerror: (e) => console.error('Live session error:', e),
                onmessage: (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        const { text } = message.serverContent.inputTranscription;
                        latestTranscriptionTextRef.current += text;

                        if (animationFrameRef.current === null) {
                            animationFrameRef.current = requestAnimationFrame(() => {
                                setTranscriptionSegments(prev => {
                                    const newSegments = [...prev];
                                    const lastSegment = newSegments[newSegments.length - 1];
                                    if (lastSegment && !lastSegment.isFinal) {
                                        lastSegment.text = latestTranscriptionTextRef.current;
                                    } else {
                                        newSegments.push({ id: `t-${Date.now()}`, text: latestTranscriptionTextRef.current, isFinal: false });
                                    }
                                    return newSegments;
                                });
                                animationFrameRef.current = null;
                            });
                        }
                    }
                    if (message.serverContent?.turnComplete) {
                        if (animationFrameRef.current) {
                            cancelAnimationFrame(animationFrameRef.current);
                            animationFrameRef.current = null;
                        }
                        const finalizedText = latestTranscriptionTextRef.current.trim();
                        if(finalizedText) {
                            const finalizedSegment: Segment = { id: `t-${Date.now()}`, text: finalizedText, isFinal: true };
                            
                            setTranscriptionSegments(prev => {
                                const newSegments = prev.filter(s => s.isFinal);
                                newSegments.push(finalizedSegment);
                                return newSegments;
                            });

                             setTranslationSegments(prev => [
                               ...prev.filter(s => s.isFinal), { id: finalizedSegment.id, text: '...', isFinal: false }
                            ]);

                            if (translationTimerRef.current) {
                                clearTimeout(translationTimerRef.current);
                            }
                            translationTimerRef.current = window.setTimeout(processTranslation, TRANSLATION_DEBOUNCE_MS);
                        }
                        latestTranscriptionTextRef.current = '';
                    }
                },
            },
        });

        workletNodeRef.current.port.onmessage = (event) => {
            const pcmBlob: Blob = {
                data: encode(new Uint8Array(event.data.buffer)),
                mimeType: 'audio/pcm;rate=16000',
            };
            sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
            }).catch(err => {
                console.warn("Could not send audio data, session might be closed.", err);
            });
        };
        
        try {
            await sessionPromiseRef.current;
            console.log("Live session connection successful.");
        } catch (err) {
            console.error("Failed to connect live session:", err);
            // Stop fully if connection fails
            // This needs a proper stop function, let's call the main one
        }

    }, [processTranslation]);

    const stopTranscription = useCallback(() => {
        setIsRecording(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (translationTimerRef.current) {
            clearTimeout(translationTimerRef.current);
            translationTimerRef.current = null;
        }
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        sessionPromiseRef.current?.then(session => session.close());
        workletNodeRef.current?.port.close();
        workletNodeRef.current?.disconnect();
        if (audioContextRef.current?.state !== 'closed') {
             audioContextRef.current?.close().catch(e => console.error("Error closing AudioContext:", e));
        }
       
        mediaStreamRef.current = null;
        sessionPromiseRef.current = null;
        workletNodeRef.current = null;
        audioContextRef.current = null;
    }, []);

    const startTranscription = useCallback(async () => {
        if (!process.env.API_KEY) {
            alert("API Key not found. Please select an API key.");
            return;
        }

        setIsRecording(true);
        setTranscriptionSegments([]);
        setTranslationSegments([]);
        latestTranscriptionTextRef.current = '';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const audioContext = audioContextRef.current;
            
            isInterruptedRef.current = false;
            
            audioContext.onstatechange = async () => {
                if (audioContext.state === 'interrupted' || audioContext.state === 'suspended') {
                    console.warn(`AudioContext state is ${audioContext.state}. Pausing session.`);
                    isInterruptedRef.current = true;
                    sessionPromiseRef.current?.then(session => session.close());
                    sessionPromiseRef.current = null;
                } else if (audioContext.state === 'running' && isInterruptedRef.current) {
                    console.log('AudioContext resumed, re-establishing live session...');
                    isInterruptedRef.current = false;
                    await establishLiveSession();
                }
            };
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const blob = new Blob([audioWorkletProcessor], { type: 'application/javascript' });
            const workletURL = URL.createObjectURL(blob);
            await audioContext.audioWorklet.addModule(workletURL);
            
            workletNodeRef.current = new AudioWorkletNode(audioContext, 'audio-processor', {
                processorOptions: { bufferSize: AUDIO_BUFFER_SIZE }
            });
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(workletNodeRef.current);
            workletNodeRef.current.connect(audioContext.destination);

            await establishLiveSession();

        } catch (err) {
            console.error('Failed to start transcription:', err);
            stopTranscription();
        }
    }, [establishLiveSession, stopTranscription]);


    const handleToggleRecording = () => {
        isRecording ? stopTranscription() : startTranscription();
    };
    
    useEffect(() => {
        return () => {
            if (isRecording) {
                stopTranscription();
            }
        };
    }, [isRecording, stopTranscription]);

    if (!apiKeyReady) {
        return <ApiKeySelector onApiKeySelected={() => setApiKeyReady(true)} />;
    }

    return (
        <div className="flex flex-col h-screen font-sans">
            <header className="w-full text-center py-4 bg-gray-900 border-b border-gray-700 shadow-md">
                <h1 className="text-3xl font-bold text-white">
                    Live Transcription & Translation
                </h1>
            </header>
            <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
                <TextPanel title="Live Transcription" segments={transcriptionSegments} />
                <TextPanel title="Real-time Translation" segments={translationSegments} />
            </main>
            <footer className="sticky bottom-0">
                <Controls
                    isRecording={isRecording}
                    onToggleRecording={handleToggleRecording}
                    targetLanguage={targetLanguage}
                    onLanguageChange={setTargetLanguage}
                />
            </footer>
        </div>
    );
};

export default App;