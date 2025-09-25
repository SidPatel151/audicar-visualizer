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
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="app-title">🎵 AudioCar</h1>
            <p className="app-subtitle">Music Visualizer & Downloader</p>
          </div>
          
          <nav className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'visualizer' ? 'active' : ''}`}
              onClick={() => setActiveTab('visualizer')}
            >
              <span className="tab-icon">🎨</span>
              <span className="tab-text">Visualizer</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'downloader' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloader')}
            >
              <span className="tab-icon">🎵</span>
              <span className="tab-text">Downloader</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="app-content">
        {activeTab === 'visualizer' && (
          <AudioVisualizer 
            audioFile={currentAudio}
            onAudioChange={setCurrentAudio}
          />
        )}
        
        {activeTab === 'downloader' && (
          <YouTubeDownloader onAudioDownloaded={handleAudioDownloaded} />
        )}
      </main>
    </div>
  );
}

export default App; 