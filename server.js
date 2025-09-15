const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { downloadVideo, downloadAudio, isValidYouTubeUrl, searchYouTube } = require('./youtube-downloader');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Search YouTube using youtube-downloader.js
app.get('/api/search', async (req, res) => {
  try {
    const { q: query, maxResults = 5 } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    console.log(`🔍 Searching for: "${query}"`);
    const results = await searchYouTube(query, maxResults);
    
    if (!results || results.length === 0) {
      return res.status(404).json({ success: false, error: 'No videos found for this search term' });
    }

    const formattedResults = results.map(video => ({
      id: video.id,
      title: video.title,
      url: video.url,
      duration: video.duration,
      channel: video.channel?.name || 'Unknown',
      views: video.views,
      thumbnail: video.thumbnail?.url
    }));

    res.json({ success: true, data: formattedResults });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed: ' + error.message });
  }
});

// Download video/audio
app.post('/api/download', async (req, res) => {
  try {
    const { videoId, format = 'mp3' } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Video ID is required' });
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    console.log(`🚀 Starting ${format.toUpperCase()} download for: ${url}`);
    
    let filePath;
    if (format === 'mp3') {
      filePath = await downloadAudio(url, './downloads');
    } else {
      filePath = await downloadVideo(url, './downloads');
    }

    const filename = path.basename(filePath);
    
    // Wait a moment for file processing to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if file exists before reading
    if (!fs.existsSync(filePath)) {
      throw new Error(`Downloaded file not found: ${filePath}`);
    }
    
    // Read the file and send it as base64 for the frontend
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    // Clean up any temporary HTML files created during download
    setTimeout(() => {
      const files = fs.readdirSync('./');
      files.forEach(file => {
        if (file.match(/^\d+-watch\.html$/)) {
          try {
            fs.unlinkSync(file);
            console.log(`🗑️ Cleaned up temporary file: ${file}`);
          } catch (err) {
            console.log(`⚠️ Could not delete ${file}:`, err.message);
          }
        }
      });
    }, 1000);
    
    res.json({ 
      success: true, 
      filename: filename,
      audioData: base64Audio,
      message: `${format.toUpperCase()} download completed successfully!` 
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Download failed: ' + error.message });
  }
});

// Get available downloads
app.get('/api/downloads', (req, res) => {
  try {
    const downloadsDir = './downloads';
    if (!fs.existsSync(downloadsDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(downloadsDir)
      .filter(file => file.endsWith('.mp3') || file.endsWith('.mp4'))
      .map(file => ({
        name: file,
        url: `/downloads/${file}`,
        type: path.extname(file).substring(1)
      }));

    res.json({ files });
  } catch (error) {
    console.error('Error reading downloads:', error);
    res.status(500).json({ error: 'Failed to read downloads' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running!', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 YouTube Downloader API running on http://localhost:${PORT}`);
  console.log(`📁 Downloads will be served from: http://localhost:${PORT}/downloads`);
});
