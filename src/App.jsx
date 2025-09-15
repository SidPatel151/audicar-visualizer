import React, { useState } from 'react';
import './App.css';
import AudioVisualizer from './components/AudioVisualizer';
import YouTubeDownloader from './components/YouTubeDownloader';

function App() {
  const [currentAudio, setCurrentAudio] = useState(null);
  const [activeTab, setActiveTab] = useState('visualizer'); // 'visualizer' or 'downloader'
  const [playAudioFile, setPlayAudioFile] = useState(null);

  const handleAudioDownloaded = (audioData) => {
    setCurrentAudio(audioData);
    setActiveTab('visualizer'); // Switch to visualizer when audio is downloaded
  };

  const handleAudioChange = (audioData) => {
    setCurrentAudio(audioData);
    if (audioData.playAudioFile) {
      setPlayAudioFile(() => audioData.playAudioFile);
    }
  };

  return (
    <div className="App">
      <div className="app-header">
        <h1>🎵 AudioCar - Music Visualizer & Downloader</h1>
        <div className="tab-buttons">
          <button 
            className={`tab-button ${activeTab === 'visualizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('visualizer')}
          >
            🎨 Visualizer
          </button>
          <button 
            className={`tab-button ${activeTab === 'downloader' ? 'active' : ''}`}
            onClick={() => setActiveTab('downloader')}
          >
            🎵 Downloader
          </button>
        </div>
      </div>

      <div className="app-content">
        {activeTab === 'visualizer' && (
          <AudioVisualizer 
            audioFile={currentAudio}
            onAudioChange={setCurrentAudio}
          />
        )}
        
        {activeTab === 'downloader' && (
          <YouTubeDownloader onAudioDownloaded={handleAudioDownloaded} />
        )}
      </div>
    </div>
  );
}

export default App; 