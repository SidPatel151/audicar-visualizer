const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const YouTube = require('youtube-sr').default;
const https = require('https');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to validate YouTube URL
function isValidYouTubeUrl(url) {
    return ytdl.validateURL(url);
}

// Enhanced request options to bypass bot detection
const getRequestOptions = () => ({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
});

// Extract artist and song from YouTube title
function parseVideoTitle(title) {
    // Common patterns: "Artist - Song", "Artist: Song", "Song by Artist"
    let artist = '', song = '';
    
    // Remove common suffixes
    title = title.replace(/\s*[\(\[]*(official|music|video|lyrics|audio|hd|4k)[\)\]]*\s*/gi, '');
    title = title.replace(/\s*-\s*(official|music|video|lyrics|audio|hd|4k)\s*/gi, '');
    
    if (title.includes(' - ')) {
        [artist, song] = title.split(' - ', 2);
    } else if (title.includes(': ')) {
        [artist, song] = title.split(': ', 2);
    } else if (title.toLowerCase().includes(' by ')) {
        [song, artist] = title.toLowerCase().split(' by ', 2);
    } else {
        // Fallback: assume first part is artist
        const words = title.split(' ');
        if (words.length > 2) {
            artist = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            song = words.slice(Math.ceil(words.length / 2)).join(' ');
        } else {
            song = title;
        }
    }
    
    return {
        artist: artist.trim(),
        song: song.trim()
    };
}

// Get synced lyrics from LRCLib API
async function getSyncedLyrics(artist, song) {
    return new Promise((resolve, reject) => {
        const query = encodeURIComponent(`${artist} ${song}`.trim());
        const url = `https://lrclib.net/api/search?q=${query}`;
        
        console.log(`🔍 Searching LRCLib for: "${artist} - ${song}"`);
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    
                    if (results && results.length > 0) {
                        const bestMatch = results[0]; // Take first result
                        resolve({
                            artist: bestMatch.artistName,
                            song: bestMatch.trackName,
                            album: bestMatch.albumName,
                            duration: bestMatch.duration,
                            plainLyrics: bestMatch.plainLyrics,
                            syncedLyrics: bestMatch.syncedLyrics,
                            hasTimestamps: !!bestMatch.syncedLyrics
                        });
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Display synced lyrics with timestamps
function displaySyncedLyrics(lyricsData) {
    if (!lyricsData) {
        console.log('❌ No lyrics found');
        return;
    }
    
    console.log('\n📝 Lyrics Found!');
    console.log('================');
    console.log(`🎵 ${lyricsData.artist} - ${lyricsData.song}`);
    if (lyricsData.album) console.log(`💽 Album: ${lyricsData.album}`);
    console.log('');
    
    if (lyricsData.hasTimestamps && lyricsData.syncedLyrics) {
        console.log('⏰ **SYNCED LYRICS WITH TIMESTAMPS:**');
        console.log('====================================');
        
        // Parse LRC format and show first few lines
        const lines = lyricsData.syncedLyrics.split('\n').slice(0, 10);
        lines.forEach(line => {
            if (line.trim() && line.includes(']')) {
                console.log(line);
            }
        });
        
        if (lyricsData.syncedLyrics.split('\n').length > 10) {
            console.log('... (more lyrics available) ...');
        }
        
    } else if (lyricsData.plainLyrics) {
        console.log('📄 **PLAIN LYRICS (No Timestamps):**');
        console.log('===================================');
        console.log(lyricsData.plainLyrics.substring(0, 500) + '...');
    }
    
    console.log('\n');
}

// Function to search YouTube by name
async function searchYouTube(query, maxResults = 5) {
    try {
        console.log(`🔍 Searching for: "${query}"`);
        const results = await YouTube.search(query, { limit: maxResults, type: 'video' });
        
        if (results.length === 0) {
            throw new Error('No videos found for this search term');
        }
        
        console.log('\n📺 Search Results:');
        console.log('==================');
        
        results.forEach((video, index) => {
            const duration = video.duration ? `[${video.duration}]` : '[Unknown duration]';
            const views = video.views ? `${video.views.toLocaleString()} views` : '';
            console.log(`${index + 1}. ${video.title}`);
            console.log(`   👤 ${video.channel?.name || 'Unknown'} ${duration} ${views}`);
            console.log(`   🔗 ${video.url}`);
            console.log('');
        });
        
        return results;
    } catch (error) {
        console.log('❌ Search failed:', error.message);
        return null;
    }
}

// Function to check if yt-dlp is installed
async function checkYtDlp() {
    try {
        await execAsync('yt-dlp --version');
        return true;
    } catch (error) {
        return false;
    }
}

// Function to download using yt-dlp (primary method - faster!)
async function downloadWithYtDlp(url, format = 'mp4', outputPath = './downloads') {
    try {
        console.log('🚀 Using yt-dlp (faster method)...');
        
        // Create downloads directory if it doesn't exist
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        const outputTemplate = `${outputPath}/%(title)s.%(ext)s`;
        
        let command;
        if (format === 'mp3') {
            // Simplified MP3 download
            command = `yt-dlp --extract-audio --audio-format mp3 --audio-quality 192K -o "${outputTemplate}" --no-playlist "${url}"`;
        } else {
            // Simplified MP4 download
            command = `yt-dlp -f "best[ext=mp4]/best" -o "${outputTemplate}" --no-playlist "${url}"`;
        }
        
        console.log('🔧 Command:', command);

        console.log('⬇️ Starting fast download...');
        
        // Execute with better error handling
        const child = exec(command);
        
        let errorOutput = '';
        let standardOutput = '';
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            standardOutput += output;
            console.log(output); // Show all output for debugging
            
            if (output.includes('%')) {
                // Extract and show progress
                const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
                if (progressMatch) {
                    process.stdout.write(`\r📊 Progress: ${progressMatch[1]}%`);
                }
            }
        });
        
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('❌ Error output:', data.toString());
        });
        
        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                if (code === 0) {
                    console.log('\n✅ Download completed successfully!');
                    // Extract the actual file path from the output
                    const fileMatch = standardOutput.match(/Destination: (\.\/downloads\/[^\n]+)/);
                    if (fileMatch) {
                        resolve(fileMatch[1]);
                    } else {
                        // Fallback: construct expected filename
                        const titleMatch = standardOutput.match(/\[download\] Destination: \.\/downloads\/([^\n]+)/);
                        if (titleMatch) {
                            resolve(`./downloads/${titleMatch[1]}`);
                        } else {
                            resolve(true); // Fallback to true if we can't extract path
                        }
                    }
                } else {
                    console.log(`\n❌ Command failed with exit code: ${code}`);
                    console.log('📋 Error details:', errorOutput);
                    console.log('📋 Full output:', standardOutput);
                    reject(new Error(`Download failed with exit code ${code}: ${errorOutput}`));
                }
            });
            
            child.on('error', (error) => {
                console.log('❌ Process error:', error.message);
                reject(error);
            });
        });
        
    } catch (error) {
        console.log('❌ Fast download failed:', error.message);
        return false;
    }
}

// Function to get video info with retry logic
async function getVideoInfo(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            console.log(i > 0 ? `🔄 Retry attempt ${i}...` : '');
            
            const info = await ytdl.getInfo(url, {
                requestOptions: getRequestOptions()
            });
            
            return {
                title: info.videoDetails.title,
                duration: info.videoDetails.lengthSeconds,
                author: info.videoDetails.author.name,
                views: info.videoDetails.viewCount
            };
        } catch (error) {
            if (i === retries) {
                console.log(`\n🔧 YouTube API method failed. Trying alternative download method...`);
                throw new Error('ytdl-failed');
            }
            console.log(`⏳ Waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
        }
    }
}

// Function to sanitize filename
function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
}

// Function to download YouTube video as MP4
async function downloadVideo(url, outputPath = './downloads') {
    try {
        console.log('🔍 Validating YouTube URL...');
        
        if (!isValidYouTubeUrl(url)) {
            throw new Error('Invalid YouTube URL!');
        }

        try {
            console.log('📋 Getting video information...');
            const videoInfo = await getVideoInfo(url);
            
            console.log(`📺 Title: ${videoInfo.title}`);
            console.log(`👤 Author: ${videoInfo.author}`);
            console.log(`⏱️  Duration: ${Math.floor(videoInfo.duration / 60)}:${videoInfo.duration % 60} minutes`);
            console.log(`👀 Views: ${parseInt(videoInfo.views).toLocaleString()}`);

            // Create downloads directory if it doesn't exist
            if (!fs.existsSync(outputPath)) {
                fs.mkdirSync(outputPath, { recursive: true });
            }

            // Sanitize filename
            const filename = sanitizeFilename(videoInfo.title) + '.mp4';
            const filePath = `${outputPath}/${filename}`;

            console.log(`⬇️  Starting download: ${filename}`);

            // Download video with highest quality MP4 format
            const videoStream = ytdl(url, {
                quality: 'highest',
                filter: format => format.container === 'mp4',
                requestOptions: getRequestOptions()
            });

            const writeStream = fs.createWriteStream(filePath);
            
            // Track download progress
            let totalSize = 0;
            let downloadedSize = 0;

            videoStream.on('info', (info, format) => {
                totalSize = parseInt(format.contentLength) || 0;
                console.log(`📦 File size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
            });

            videoStream.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r📊 Progress: ${progress}% (${(downloadedSize / (1024 * 1024)).toFixed(2)}MB / ${(totalSize / (1024 * 1024)).toFixed(2)}MB)`);
                }
            });

            videoStream.pipe(writeStream);

            return new Promise((resolve, reject) => {
                writeStream.on('finish', () => {
                    console.log(`\n✅ Download completed successfully!`);
                    console.log(`📁 File saved as: ${filePath}`);
                    resolve(filePath);
                });

                videoStream.on('error', (error) => {
                    console.log(`\n❌ Download error: ${error.message}`);
                    reject(error);
                });

                writeStream.on('error', (error) => {
                    console.log(`\n❌ File write error: ${error.message}`);
                    reject(error);
                });
            });

        } catch (error) {
            if (error.message === 'ytdl-failed') {
                // Try fallback method
                const ytDlpAvailable = await checkYtDlp();
                if (ytDlpAvailable) {
                    return await downloadWithYtDlp(url, 'mp4', outputPath);
                } else {
                    console.log('📋 To install yt-dlp for more reliable downloads:');
                    console.log('   brew install yt-dlp    (macOS)');
                    console.log('   pip install yt-dlp     (Python)');
                    throw new Error('Primary download method failed and yt-dlp not available');
                }
            }
            throw error;
        }

    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        throw error;
    }
}

// Function to download audio only as MP3
async function downloadAudio(url, outputPath = './downloads') {
    try {
        console.log('🔍 Validating YouTube URL...');
        
        if (!isValidYouTubeUrl(url)) {
            throw new Error('Invalid YouTube URL!');
        }

        try {
            console.log('📋 Getting video information...');
            const videoInfo = await getVideoInfo(url);
            
            console.log(`🎵 Title: ${videoInfo.title}`);
            console.log(`👤 Author: ${videoInfo.author}`);

            // Create downloads directory if it doesn't exist
            if (!fs.existsSync(outputPath)) {
                fs.mkdirSync(outputPath, { recursive: true });
            }

            // Sanitize filename
            const filename = sanitizeFilename(videoInfo.title) + '.mp3';
            const filePath = `${outputPath}/${filename}`;

            console.log(`⬇️  Starting audio download: ${filename}`);

            // Download audio with highest quality
            const audioStream = ytdl(url, {
                quality: 'highestaudio',
                filter: 'audioonly',
                requestOptions: getRequestOptions()
            });

            const writeStream = fs.createWriteStream(filePath);
            
            audioStream.pipe(writeStream);

            return new Promise((resolve, reject) => {
                writeStream.on('finish', () => {
                    console.log(`\n✅ Audio download completed successfully!`);
                    console.log(`📁 File saved as: ${filePath}`);
                    resolve(filePath);
                });

                audioStream.on('error', (error) => {
                    console.log(`\n❌ Download error: ${error.message}`);
                    reject(error);
                });

                writeStream.on('error', (error) => {
                    console.log(`\n❌ File write error: ${error.message}`);
                    reject(error);
                });
            });

        } catch (error) {
            if (error.message === 'ytdl-failed') {
                // Try fallback method
                const ytDlpAvailable = await checkYtDlp();
                if (ytDlpAvailable) {
                    return await downloadWithYtDlp(url, 'mp3', outputPath);
                } else {
                    console.log('📋 To install yt-dlp for more reliable downloads:');
                    console.log('   brew install yt-dlp    (macOS)');
                    console.log('   pip install yt-dlp     (Python)');
                    throw new Error('Primary download method failed and yt-dlp not available');
                }
            }
            throw error;
        }

    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        throw error;
    }
}

// Quick download function using yt-dlp
async function quickDownload(url, format) {
    const ytDlpAvailable = await checkYtDlp();
    if (ytDlpAvailable) {
        return await downloadWithYtDlp(url, format);
    } else {
        console.log('⚠️ yt-dlp not found. Using slower method...');
        if (format === 'mp3') {
            return await downloadAudio(url);
        } else {
            return await downloadVideo(url);
        }
    }
}

// Main function to handle user interaction
async function main() {
    console.log('🎵 YouTube Downloader - Search & Download');
    console.log('==========================================');
    console.log('💡 Tip: You can search by name or paste a YouTube URL!');
    console.log('');
    
    rl.question('🔍 Enter song/video name or YouTube URL: ', async (input) => {
        if (!input.trim()) {
            console.log('❌ Please enter something to search for or a YouTube URL');
            rl.close();
            return;
        }

        try {
            let selectedUrl = input.trim();
            
            // Check if it's a URL or search term
            if (!isValidYouTubeUrl(input)) {
                // It's a search term
                const results = await searchYouTube(input);
                if (!results || results.length === 0) {
                    console.log('❌ No videos found. Try a different search term.');
                    rl.close();
                    return;
                }
                
                // Ask user to select from results
                rl.question('📋 Choose a video (1-5) or press Enter for #1: ', (selection) => {
                    const choice = parseInt(selection) || 1;
                    if (choice < 1 || choice > results.length) {
                        console.log('❌ Invalid choice');
                        rl.close();
                        return;
                    }
                    
                    selectedUrl = results[choice - 1].url;
                    console.log(`\n✅ Selected: ${results[choice - 1].title}`);
                    console.log(`🔗 URL: ${selectedUrl}`);
                    
                    // Ask if they want lyrics
                    rl.question('📝 Want to see lyrics with timestamps? (y/n): ', async (lyricsChoice) => {
                        if (lyricsChoice.toLowerCase() === 'y' || lyricsChoice.toLowerCase() === 'yes') {
                            try {
                                const parsed = parseVideoTitle(results[choice - 1].title);
                                const lyricsData = await getSyncedLyrics(parsed.artist, parsed.song);
                                displaySyncedLyrics(lyricsData);
                            } catch (error) {
                                console.log('❌ Error fetching lyrics:', error.message);
                            }
                        }
                        
                        // Ask for format
                        askFormatAndDownload(selectedUrl);
                    });
                });
            } else {
                // It's already a URL
                console.log(`🔗 Using URL: ${selectedUrl}`);
                askFormatAndDownload(selectedUrl);
            }
        } catch (error) {
            console.log('❌ Error:', error.message);
            rl.close();
        }
    });
}

// Helper function to ask for format and download
function askFormatAndDownload(url) {
    rl.question('📼 Format: (1) MP4 Video (2) MP3 Audio [default: 1]: ', async (choice) => {
        try {
            const format = (choice === '2' || choice.toLowerCase() === 'mp3') ? 'mp3' : 'mp4';
            console.log(`\n🚀 Starting ${format.toUpperCase()} download for: ${url}`);
            console.log('⚠️  Downloading ONLY this video...');
            
            await quickDownload(url, format);
            
        } catch (error) {
            console.log('❌ Download failed:', error.message);
        } finally {
            rl.close();
        }
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Download interrupted. Goodbye!');
    rl.close();
    process.exit(0);
});

// Run the program
if (require.main === module) {
    main();
}

module.exports = {
    downloadVideo,
    downloadAudio,
    getVideoInfo,
    isValidYouTubeUrl,
    searchYouTube
};
