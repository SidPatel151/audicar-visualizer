import React, { useState, useRef } from 'react';
import './YouTubeDownloader.css';
import { API_ENDPOINTS } from '../config/api';

const YouTubeDownloader = ({ onAudioDownloaded }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedFiles, setDownloadedFiles] = useState([]);
  const [error, setError] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp3');
  const audioRef = useRef(null);

  // Search for YouTube videos
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError('');
    setSearchResults([]);

    try {
      const response = await fetch(`${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(searchQuery)}&maxResults=8`);
      const data = await response.json();

      if (data.success) {
        setSearchResults(data.data);
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      setError('Failed to search. Please check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  // Download selected video
  const handleDownload = async (video) => {
    setIsDownloading(true);
    setError('');
    setDownloadProgress(0);

    try {
      const response = await fetch(API_ENDPOINTS.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: video.id,
          format: selectedFormat
        })
      });

      const data = await response.json();

      if (data.success) {
        // Create audio URL from base64 data
        const audioUrl = `data:audio/${selectedFormat};base64,${data.audioData}`;
        
        // Update downloaded files list
        setDownloadedFiles(prev => [...prev, {
          id: video.id,
          title: video.title,
          filename: data.filename,
          url: audioUrl,
          format: selectedFormat
        }]);

        // Notify parent component about the new audio
        if (onAudioDownloaded) {
          onAudioDownloaded({
            title: video.title,
            url: audioUrl,
            filename: data.filename
          });
        }

        setDownloadProgress(100);
        setTimeout(() => setDownloadProgress(0), 2000);
      } else {
        setError(data.error || 'Download failed');
      }
    } catch (err) {
      setError('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Play downloaded audio
  const playAudio = (audioUrl) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format views
  const formatViews = (views) => {
    if (!views) return '';
    return views.toLocaleString() + ' views';
  };

  return (
    <div className="youtube-downloader">
      <div className="downloader-header">
        <h2>🎵 YouTube Music Downloader</h2>
        <p>Search and download your favorite music from YouTube</p>
      </div>

      {/* Search Section */}
      <div className="search-section">
        <div className="search-input-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for music, artist, or song..."
            className="search-input"
            disabled={isSearching}
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="search-button"
          >
            {isSearching ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>

        <div className="format-selector">
          <label>Download Format:</label>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="format-select"
          >
            <option value="mp3">MP3 Audio</option>
            <option value="mp4">MP4 Video</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Download Progress */}
      {isDownloading && (
        <div className="download-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>
          <span>Downloading... {downloadProgress}%</span>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <h3>Search Results</h3>
          <div className="results-grid">
            {searchResults.map((video) => (
              <div key={video.id} className="video-card">
                <div className="video-thumbnail">
                  {video.thumbnail && (
                    <img 
                      src={video.thumbnail} 
                      alt={video.title}
                      className="thumbnail-image"
                    />
                  )}
                  <div className="video-duration">
                    {formatDuration(video.duration)}
                  </div>
                </div>
                
                <div className="video-info">
                  <h4 className="video-title" title={video.title}>
                    {video.title}
                  </h4>
                  <p className="video-channel">{video.channel}</p>
                  <p className="video-views">{formatViews(video.views)}</p>
                  
                  <button
                    onClick={() => handleDownload(video)}
                    disabled={isDownloading}
                    className="download-button"
                  >
                    {isDownloading ? '⏳ Downloading...' : `⬇️ Download ${selectedFormat.toUpperCase()}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Downloaded Files */}
      {downloadedFiles.length > 0 && (
        <div className="downloaded-files">
          <h3>Downloaded Files</h3>
          <div className="files-list">
            {downloadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-info">
                  <span className="file-title">{file.title}</span>
                  <span className="file-format">{file.format.toUpperCase()}</span>
                </div>
                <div className="file-actions">
                  <button
                    onClick={() => playAudio(file.url)}
                    className="play-button"
                  >
                    ▶️ Play
                  </button>
                  <a
                    href={file.url}
                    download={file.filename}
                    className="download-link"
                  >
                    💾 Save
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} controls style={{ display: 'none' }} />
    </div>
  );
};

export default YouTubeDownloader;
