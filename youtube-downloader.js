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

// Function to update yt-dlp to latest version
async function updateYtDlp() {
    try {
        console.log('🔄 Updating yt-dlp to latest version...');
        await execAsync('pip install --upgrade yt-dlp');
        console.log('✅ yt-dlp updated successfully!');
        return true;
    } catch (error) {
        console.log('❌ Failed to update yt-dlp:', error.message);
        return false;
    }
}

// Helper to extract a YouTube video ID from a URL
function extractVideoId(url) {
    try {
        // Standard watch URL
        let match = url.match(/[?&]v=([^&#]+)/);
        if (match && match[1]) return match[1];
        // youtu.be short URL
        match = url.match(/youtu\.be\/([^?#/]+)/);
        if (match && match[1]) return match[1];
        // shorts URL
        match = url.match(/youtube\.com\/shorts\/([^?#/]+)/);
        if (match && match[1]) return match[1];
    } catch (_) {}
    return null;
}

// Function to download using yt-dlp (primary method - faster!)
async function downloadWithYtDlp(url, format = 'mp4', outputPath = './downloads') {
    try {
        console.log('🚀 Using yt-dlp (faster method)...');
        
        // Create downloads directory if it doesn't exist
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
        
        const videoId = extractVideoId(url);
        // Include video ID in filename to disambiguate files and avoid stale matches
        const outputTemplate = videoId
            ? `${outputPath}/%(id)s-%(title)s.%(ext)s`
            : `${outputPath}/%(title)s.%(ext)s`;
        
        // Try multiple download strategies
        const downloadStrategies = [];
        
        if (format === 'mp3') {
            downloadStrategies.push(
                // Strategy 1: Android client with best quality
                `yt-dlp --extract-audio --audio-format mp3 --audio-quality 192K -o "${outputTemplate}" --no-playlist --extractor-args "youtube:player_client=android" "${url}"`,
                // Strategy 2: Web client with lower quality
                `yt-dlp --extract-audio --audio-format mp3 --audio-quality 128K -o "${outputTemplate}" --no-playlist --extractor-args "youtube:player_client=web" "${url}"`,
                // Strategy 3: Fallback with any available audio
                `yt-dlp --extract-audio --audio-format mp3 -o "${outputTemplate}" --no-playlist --ignore-errors "${url}"`
            );
        } else {
            downloadStrategies.push(
                // Strategy 1: Best quality with Android client
                `yt-dlp -f "best[ext=mp4]/best[height<=720]/best" -o "${outputTemplate}" --no-playlist --extractor-args "youtube:player_client=android" "${url}"`,
                // Strategy 2: Lower quality with web client
                `yt-dlp -f "best[height<=480]/best" -o "${outputTemplate}" --no-playlist --extractor-args "youtube:player_client=web" "${url}"`,
                // Strategy 3: Fallback with any available format
                `yt-dlp -f "best" -o "${outputTemplate}" --no-playlist --ignore-errors "${url}"`
            );
        }
        
        // Try each strategy until one works
        for (let i = 0; i < downloadStrategies.length; i++) {
            const command = downloadStrategies[i];
            console.log(`🔧 Strategy ${i + 1}:`, command);
            
            try {
                const result = await executeDownloadCommand(command, url);
                if (result) {
                    console.log(`✅ Strategy ${i + 1} succeeded!`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ Strategy ${i + 1} failed:`, error.message);
                if (i === downloadStrategies.length - 1) {
                    throw error; // Re-throw if all strategies failed
                }
            }
        }
        
        throw new Error('All download strategies failed');
    } catch (error) {
        console.log('❌ Fast download failed:', error.message);
        return false;
    }
}

// Helper function to execute a single download command
async function executeDownloadCommand(command, url) {
    return new Promise((resolve, reject) => {
        console.log('⬇️ Starting download...');
        
        const child = exec(command);
        
        let errorOutput = '';
        let standardOutput = '';
        const expectedId = extractVideoId(url);
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            standardOutput += output;
            console.log(output);
            
            if (output.includes('%')) {
                const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
                if (progressMatch) {
                    const progress = parseFloat(progressMatch[1]);
                    if (progress % 10 === 0) {
                        console.log(`📊 Progress: ${progress}%`);
                    }
                }
            }
        });
        
        child.stderr.on('data', (data) => {
            const error = data.toString();
            errorOutput += error;
            console.log('❌ Error output:', error);
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Download completed successfully!');
                
                // Try multiple patterns to extract file path
                let filePath = null;
                
                // First, strip ANSI escape sequences (colors) just in case
                const cleanedOutput = standardOutput.replace(/\u001b\[[0-9;]*m/g, '');
                
                // Pattern 1: Destination: ./downloads/filename (any prefix)
                const fileMatch = cleanedOutput.match(/Destination:\s+(\.\/downloads\/[^^\n]+\.(mp3|mp4|m4a|wav))/i);
                if (fileMatch) {
                    filePath = fileMatch[1];
                } else {
                    // Pattern 2: [download] Destination: ./downloads/filename
                    const titleMatch = cleanedOutput.match(/\[download\]\s+Destination:\s+\.\/downloads\/([^\n]+\.(mp3|mp4|m4a|wav))/i);
                    if (titleMatch) {
                        filePath = `./downloads/${titleMatch[1]}`;
                    } else {
                        // Pattern 3: [download] 100% of filename
                        const progressMatch = cleanedOutput.match(/\[download\]\s+100% of\s+([^\n]+\.(mp3|mp4|m4a|wav))/i);
                        if (progressMatch) {
                            filePath = `./downloads/${progressMatch[1]}`;
                        } else {
                            // Fallback: prefer files that start with the expected video ID
                            try {
                                const files = fs.readdirSync('./downloads');
                                let candidates = files.filter(f => f.endsWith('.mp3') || f.endsWith('.mp4'));
                                if (expectedId) {
                                    const idMatches = candidates.filter(f => f.startsWith(`${expectedId}-`));
                                    if (idMatches.length > 0) {
                                        // Choose the newest among ID matches
                                        const latestIdMatch = idMatches.reduce((latest, current) => {
                                            const latestPath = `./downloads/${latest}`;
                                            const currentPath = `./downloads/${current}`;
                                            return fs.statSync(currentPath).mtime > fs.statSync(latestPath).mtime ? current : latest;
                                        });
                                        filePath = `./downloads/${latestIdMatch}`;
                                    }
                                }
                                // Final fallback: newest file (rarely used now)
                                if (!filePath && candidates.length > 0) {
                                    const latestFile = candidates.reduce((latest, current) => {
                                        const latestPath = `./downloads/${latest}`;
                                        const currentPath = `./downloads/${current}`;
                                        return fs.statSync(currentPath).mtime > fs.statSync(latestPath).mtime ? current : latest;
                                    });
                                    filePath = `./downloads/${latestFile}`;
                                }
                            } catch (_) {}
                        }
                    }
                }
                
                if (filePath && fs.existsSync(filePath)) {
                    console.log(`📁 File found: ${filePath}`);
                    resolve(filePath);
                } else {
                    console.log('❌ Could not determine file path from output');
                    console.log('📋 Standard output:', cleanedOutput);
                    reject(new Error('Could not determine downloaded file path'));
                }
            } else {
                console.log(`\n❌ Command failed with exit code: ${code}`);
                console.log('📋 Error details:', errorOutput);
                reject(new Error(`Download failed with exit code ${code}: ${errorOutput}`));
            }
        });
        
        child.on('error', (error) => {
            console.log('❌ Process error:', error.message);
            reject(error);
        });
    });
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

        console.log('📋 Starting download with yt-dlp...');

        // Check if yt-dlp is available first
        const ytDlpAvailable = await checkYtDlp();
        if (!ytDlpAvailable) {
            console.log('❌ yt-dlp not found. Please install it:');
            console.log('   brew install yt-dlp    (macOS)');
            console.log('   pip install yt-dlp     (Python)');
            throw new Error('yt-dlp not available');
        }

        // Try downloading with yt-dlp
        try {
            return await downloadWithYtDlp(url, 'mp3', outputPath);
        } catch (error) {
            console.log('❌ First attempt failed, trying to update yt-dlp...');
            
            // Try updating yt-dlp and retry
            const updateSuccess = await updateYtDlp();
            if (updateSuccess) {
                console.log('🔄 Retrying download with updated yt-dlp...');
                return await downloadWithYtDlp(url, 'mp3', outputPath);
            } else {
                throw error;
            }
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

        console.log('📋 Starting audio download with yt-dlp...');

        // Check if yt-dlp is available first
        const ytDlpAvailable = await checkYtDlp();
        if (!ytDlpAvailable) {
            console.log('❌ yt-dlp not found. Please install it:');
            console.log('   brew install yt-dlp    (macOS)');
            console.log('   pip install yt-dlp     (Python)');
            throw new Error('yt-dlp not available');
        }

        // Try downloading with yt-dlp
        try {
            return await downloadWithYtDlp(url, 'mp3', outputPath);
        } catch (error) {
            console.log('❌ First attempt failed, trying to update yt-dlp...');
            
            // Try updating yt-dlp and retry
            const updateSuccess = await updateYtDlp();
            if (updateSuccess) {
                console.log('🔄 Retrying download with updated yt-dlp...');
                return await downloadWithYtDlp(url, 'mp3', outputPath);
            } else {
                throw error;
            }
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
