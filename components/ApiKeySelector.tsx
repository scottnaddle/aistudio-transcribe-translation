import React from 'react';

// Fix: Moved AIStudio interface inside `declare global` to resolve type conflict.
// Add AIStudio interface to resolve type conflict with global declaration
// Extend the Window interface to include the aistudio object
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

interface ApiKeySelectorProps {
  onApiKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onApiKeySelected }) => {
  const handleSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Assume success after the dialog is closed, as hasSelectedApiKey might have a delay
        onApiKeySelected();
      } catch (error) {
        console.error("Error opening API key selection dialog:", error);
      }
    } else {
      alert("AI Studio context not found. Please run this in the correct environment.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-4">
      <div className="text-center bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md">
        <h1 className="text-3xl font-bold mb-4 text-cyan-400">Welcome</h1>
        <p className="text-gray-300 mb-6">
          This application uses the Gemini Live API which requires you to select an API key for your project. Your key is used for billing and quota purposes.
        </p>
        <button
          onClick={handleSelectKey}
          className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75"
        >
          Select API Key
        </button>
        <p className="text-xs text-gray-500 mt-6">
          By proceeding, you agree to the terms of service. For more information on billing, visit{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">
            ai.google.dev/gemini-api/docs/billing
          </a>.
        </p>
      </div>
    </div>
  );
};

export default ApiKeySelector;